'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { sdk } from '@/lib/api-client';

import { useAssistAttachmentsStore } from '../store/use-assist-attachments-store';
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

let msgCounter = 0;
const nextId = () => `msg-${++msgCounter}`;

const TOOL_QUERY_KEYS: Record<string, string[][]> = {
  create_note: [['notes']],
  refine_note: [['notes']],
  create_test: [['tests']],
  edit_test: [['tests'], ['questions']],
  refine_questions: [['tests'], ['questions']],
};

const UNDO_TOAST_DURATION = 8000;

type UseAssistReturn = {
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (text: string, displayText?: string) => void;
  addLocalMessage: (text: string) => void;
  stop: () => void;
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
        m.type === 'confirm_required' && m.status === 'pending' ? { ...m, status: 'rejected' as const } : m
      )
    );

    pendingToolIdsRef.current.clear();
  }, []);

  const streamResponse = useCallback(
    async (request: AssistRequest) => {
      setIsStreaming(true);
      abortRef.current = new AbortController();

      let assistantText = '';
      let currentSegmentId = '';
      const toolCalls: ToolCallData[] = [];
      const toolResults: ToolResultData[] = [];

      // SSE streaming requires raw fetch — the generated SDK doesn't support streaming responses
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
          setMessages(prev => [...prev, { type: 'error', id: nextId(), message: error.detail ?? 'An error occurred' }]);
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
              try {
                const data: unknown = JSON.parse(line.slice(6));
                handleSSEEvent(eventType, data);
              } catch {
                // Skip malformed SSE events instead of aborting the stream
              }
              eventType = '';
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages(prev => [
            ...prev,
            { type: 'error', id: nextId(), message: 'Connection lost. Please try again.' },
          ]);
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
              if (last?.type === 'assistant' && last.id === currentSegmentId) {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantText } : m));
              }
              currentSegmentId = nextId();
              return [
                ...prev,
                { type: 'assistant' as const, id: currentSegmentId, content: assistantText, streaming: true },
              ];
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
            setMessages(prev => [...prev, { type: 'error', id: nextId(), message }]);
            break;
          }
        }
      }
    },
    [router, queryClient, setPendingNoteDiff]
  );

  const send = useCallback(
    (text: string, displayText?: string) => {
      if (!text.trim() || abortRef.current) return;

      resolvePendingConfirmations();

      const userMsg: AssistMessage = { role: 'user', content: text };
      conversationRef.current.push(userMsg);
      setMessages(prev => [
        ...prev,
        { type: 'user', id: nextId(), content: text, displayContent: displayText },
      ]);

      const request: AssistRequest = {
        messages: conversationRef.current,
        pageContext,
      };
      void streamResponse(request);
    },
    [pageContext, streamResponse, resolvePendingConfirmations]
  );

  const addLocalMessage = useCallback(
    (text: string) => {
      setMessages(prev => [...prev, { type: 'user', id: nextId(), content: text }]);
    },
    []
  );

  const setAddLocalMessage = useAssistAttachmentsStore(s => s.setAddLocalMessage);
  useEffect(() => {
    setAddLocalMessage(addLocalMessage);
    return () => setAddLocalMessage(null);
  }, [addLocalMessage, setAddLocalMessage]);

  const confirm = useCallback(
    (toolCallId: string, approved: boolean) => {
      const otherPendingIds = [...pendingToolIdsRef.current].filter(id => id !== toolCallId);
      pendingToolIdsRef.current.clear();

      // Mark all pending confirmations in the UI: the acted-on one + auto-reject the rest
      setMessages(prev =>
        prev.map(m => {
          if (m.type !== 'confirm_required' || m.status !== 'pending') return m;
          if (m.id === toolCallId) return { ...m, status: approved ? ('approved' as const) : ('rejected' as const) };
          return { ...m, status: 'rejected' as const };
        })
      );

      // Build confirmations: the user's choice + rejections for all others
      const confirmations: ToolConfirmation[] = [{ toolCallId, approved }];
      otherPendingIds.forEach(id => confirmations.push({ toolCallId: id, approved: false }));

      if (!approved) {
        // All rejected — push a single tool result message covering every tool_use id
        conversationRef.current.push({
          role: 'tool',
          content: '',
          toolResults: confirmations.map(c => ({
            toolCallId: c.toolCallId,
            output: 'User declined this action.',
          })),
        });
        return;
      }

      const request: AssistRequest = {
        messages: conversationRef.current,
        pageContext,
        toolConfirmations: confirmations,
      };
      void streamResponse(request);
    },
    [pageContext, streamResponse]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    conversationRef.current = [];
    pendingToolIdsRef.current.clear();
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, send, addLocalMessage, stop, confirm, clear };
}
