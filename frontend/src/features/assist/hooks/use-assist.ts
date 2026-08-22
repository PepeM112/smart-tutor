'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { sdk } from '@/lib/api-client';

import { useAssistDiffStore } from '../store/use-assist-diff-store';
import {
  WRITE_TOOLS,
  type AssistMessage,
  type AssistRequest,
  type ChatMessage,
  type PageContext,
  type SSEConfirmRequired,
  type SSEDone,
  type SSEError,
  type SSETextDelta,
  type SSEToolCall,
  type SSEToolExecuting,
  type SSEToolResult,
  type ToolCallData,
  type ToolConfirmation,
  type ToolResultData,
} from '../types';

const TOOL_QUERY_KEYS: Record<string, string[][]> = {
  create_note: [['notes']],
  refine_note: [['notes']],
  create_test: [['tests']],
  edit_test: [['tests'], ['questions']],
};

const UNDO_TOAST_DURATION = 8000;

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
  const pendingToolIdsRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const setPendingNoteDiff = useAssistDiffStore(s => s.setPendingNoteDiff);

  const resolvePendingConfirmations = useCallback(() => {
    if (pendingToolIdsRef.current.size === 0) return;

    const rejectedResults: ToolResultData[] = [...pendingToolIdsRef.current].map(id => ({
      toolCallId: id,
      output: 'User changed their request.',
    }));

    conversationRef.current.push({
      role: 'tool',
      content: '',
      toolResults: rejectedResults,
    });

    setMessages(prev =>
      prev.map(m =>
        m.type === 'confirm_required' && m.status === 'pending' ? { ...m, status: 'rejected' as const } : m,
      ),
    );

    pendingToolIdsRef.current.clear();
  }, []);

  const streamResponse = useCallback(
    async (request: AssistRequest) => {
      setIsStreaming(true);
      abortRef.current = new AbortController();

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
              prev.map(m => (m.type === 'tool_call' && m.id === id ? { ...m, status: 'running' as const } : m)),
            );
            break;
          }
          case 'tool_result': {
            const tr = data as SSEToolResult;
            toolResults.push({ toolCallId: tr.id, output: tr.output });
            setMessages(prev =>
              prev.map(m => (m.type === 'tool_call' && m.id === tr.id ? { ...m, status: 'done' as const } : m)),
            );
            setMessages(prev => [
              ...prev,
              { type: 'tool_result', id: tr.id, name: tr.name, output: tr.output, metadata: tr.metadata },
            ]);

            if (tr.output.startsWith('__NAVIGATE__:')) {
              const path = tr.output.split(':').slice(1).join(':');
              router.push(path);
            }

            if (WRITE_TOOLS.has(tr.name)) {
              const keys = TOOL_QUERY_KEYS[tr.name];
              keys?.forEach(key => void queryClient.invalidateQueries({ queryKey: key }));
            }

            if (tr.name === 'edit_test' && tr.metadata?.removed_question_ids?.length) {
              const ids = tr.metadata.removed_question_ids;
              toast('Questions removed', {
                description: `${ids.length} question(s) soft-deleted. You can undo this.`,
                duration: UNDO_TOAST_DURATION,
                action: {
                  label: 'Undo',
                  onClick: () => {
                    void sdk.questionsBulkRestore({ body: { questionIds: ids } }).then(() => {
                      void queryClient.invalidateQueries({ queryKey: ['tests'] });
                      void queryClient.invalidateQueries({ queryKey: ['questions'] });
                      toast.success('Questions restored');
                    });
                  },
                },
              });
            }

            if (tr.name === 'refine_note' && tr.metadata?.note_id && tr.metadata.old_content != null) {
              setPendingNoteDiff({
                noteId: tr.metadata.note_id,
                oldContent: tr.metadata.old_content,
                newContent: tr.metadata.new_content ?? '',
              });
            }

            break;
          }
          case 'confirm_required': {
            const cr = data as SSEConfirmRequired;
            pendingToolIdsRef.current.add(cr.id);
            setMessages(prev => [
              ...prev,
              {
                type: 'confirm_required',
                id: cr.id,
                name: cr.name,
                arguments: cr.arguments,
                context: cr.context,
                status: 'pending',
              },
            ]);
            break;
          }
          case 'done': {
            void (data as SSEDone);
            setMessages(prev =>
              prev.map(m => (m.type === 'assistant' && m.streaming ? { ...m, streaming: false } : m)),
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
    [router, queryClient, setPendingNoteDiff],
  );

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return;

      resolvePendingConfirmations();

      const userMsg: AssistMessage = { role: 'user', content: text };
      conversationRef.current.push(userMsg);
      setMessages(prev => [...prev, { type: 'user', content: text }]);

      const request: AssistRequest = {
        messages: conversationRef.current,
        pageContext,
      };
      void streamResponse(request);
    },
    [isStreaming, pageContext, streamResponse, resolvePendingConfirmations],
  );

  const confirm = useCallback(
    (toolCallId: string, approved: boolean) => {
      pendingToolIdsRef.current.delete(toolCallId);

      setMessages(prev =>
        prev.map(m =>
          m.type === 'confirm_required' && m.id === toolCallId
            ? { ...m, status: approved ? ('approved' as const) : ('rejected' as const) }
            : m,
        ),
      );

      if (!approved) {
        conversationRef.current.push({
          role: 'tool',
          content: '',
          toolResults: [{ toolCallId, output: 'User declined this action.' }],
        });
        return;
      }

      const confirmation: ToolConfirmation = { toolCallId, approved };

      const request: AssistRequest = {
        messages: conversationRef.current,
        pageContext,
        toolConfirmations: [confirmation],
      };
      void streamResponse(request);
    },
    [pageContext, streamResponse],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    conversationRef.current = [];
    pendingToolIdsRef.current.clear();
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, send, confirm, clear };
}
