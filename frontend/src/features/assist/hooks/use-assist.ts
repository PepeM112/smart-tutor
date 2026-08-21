'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import type {
  AssistMessage,
  AssistRequest,
  ChatMessage,
  PageContext,
  SSEConfirmRequired,
  SSEDone,
  SSEError,
  SSETextDelta,
  SSEToolCall,
  SSEToolExecuting,
  SSEToolResult,
  ToolCallData,
  ToolConfirmation,
  ToolResultData,
} from '../types';

type UseAssistReturn = {
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (text: string) => void;
  confirm: (toolCallId: string, approved: boolean) => void;
  clear: () => void;
};

export function useAssist(pageContext: PageContext): UseAssistReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const conversationRef = useRef<AssistMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const streamResponse = useCallback(
    async (request: AssistRequest) => {
      setIsStreaming(true);
      abortRef.current = new AbortController();

      // Add a placeholder for the assistant response
      setMessages(prev => [...prev, { type: 'assistant', content: '', streaming: true }]);

      let assistantText = '';
      const toolCalls: ToolCallData[] = [];
      const toolResults: ToolResultData[] = [];

      try {
        const response = await fetch('/api/v1/assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(request),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const error = (await response.json().catch(() => ({ detail: 'Request failed' }))) as {
            detail?: string;
          };
          setMessages(prev => {
            const updated = prev.filter(m => !(m.type === 'assistant' && m.streaming));
            return [...updated, { type: 'error', message: error.detail ?? 'An error occurred' }];
          });
          setIsStreaming(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ') && eventType) {
              const data: unknown = JSON.parse(line.slice(6));
              handleSSEEvent(eventType, data);
              eventType = '';
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages(prev => {
            const updated = prev.filter(m => !(m.type === 'assistant' && m.streaming));
            return [...updated, { type: 'error', message: 'Connection lost. Please try again.' }];
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }

      function handleSSEEvent(event: string, data: unknown): void {
        switch (event) {
          case 'text_delta': {
            const { content } = data as SSETextDelta;
            assistantText += content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.type === 'assistant') {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantText } : m));
              }
              return [...prev, { type: 'assistant' as const, content: assistantText, streaming: true }];
            });
            break;
          }
          case 'tool_call': {
            const tc = data as SSEToolCall;
            toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.arguments });
            setMessages(prev => [
              ...prev,
              { type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.arguments, status: 'running' },
            ]);
            break;
          }
          case 'tool_executing': {
            const { id } = data as SSEToolExecuting;
            setMessages(prev =>
              prev.map(m => (m.type === 'tool_call' && m.id === id ? { ...m, status: 'running' as const } : m))
            );
            break;
          }
          case 'tool_result': {
            const tr = data as SSEToolResult;
            toolResults.push({ toolCallId: tr.id, output: tr.output });
            setMessages(prev =>
              prev.map(m => (m.type === 'tool_call' && m.id === tr.id ? { ...m, status: 'done' as const } : m))
            );
            setMessages(prev => [...prev, { type: 'tool_result', id: tr.id, name: tr.name, output: tr.output }]);

            // Handle navigation
            if (tr.output.startsWith('__NAVIGATE__:')) {
              const path = tr.output.split(':').slice(1).join(':');
              router.push(path);
            }
            break;
          }
          case 'confirm_required': {
            const cr = data as SSEConfirmRequired;
            setMessages(prev => [
              ...prev,
              { type: 'confirm_required', id: cr.id, name: cr.name, arguments: cr.arguments, status: 'pending' },
            ]);
            break;
          }
          case 'done': {
            void (data as SSEDone);
            setMessages(prev =>
              prev.map(m => (m.type === 'assistant' && m.streaming ? { ...m, streaming: false } : m))
            );
            const assistantMsg: AssistMessage = {
              role: 'assistant',
              content: assistantText,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            };
            conversationRef.current.push(assistantMsg);
            if (toolResults.length > 0) {
              conversationRef.current.push({
                role: 'tool',
                content: '',
                toolResults,
              });
            }
            break;
          }
          case 'error': {
            const { message } = data as SSEError;
            setMessages(prev => [...prev, { type: 'error', message }]);
            break;
          }
        }
      }
    },
    [router]
  );

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: AssistMessage = { role: 'user', content: text };
      conversationRef.current.push(userMsg);
      setMessages(prev => [...prev, { type: 'user', content: text }]);

      const request: AssistRequest = {
        messages: conversationRef.current,
        pageContext,
      };
      void streamResponse(request);
    },
    [isStreaming, pageContext, streamResponse]
  );

  const confirm = useCallback(
    (toolCallId: string, approved: boolean) => {
      setMessages(prev =>
        prev.map(m =>
          m.type === 'confirm_required' && m.id === toolCallId
            ? { ...m, status: approved ? ('approved' as const) : ('rejected' as const) }
            : m
        )
      );

      const confirmation: ToolConfirmation = { toolCallId, approved };

      const request: AssistRequest = {
        messages: conversationRef.current,
        pageContext,
        toolConfirmations: [confirmation],
      };
      void streamResponse(request);
    },
    [pageContext, streamResponse]
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    conversationRef.current = [];
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, send, confirm, clear };
}
