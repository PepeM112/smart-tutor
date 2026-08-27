'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { sdk } from '@/lib/api-client';

import { useAssistAttachmentsStore } from '../store/use-assist-attachments-store';
import { useAssistDiffStore } from '../store/use-assist-diff-store';
import { consumeSSEStream } from '../utils/sse-stream';
import { getQueryKeysToInvalidate, isWriteTool } from '../utils/tool-registry';

import type {
  AssistMessage,
  AssistRequest,
  AssistTurn,
  PageContext,
  SSEConfirmRequired,
  SSEDone,
  SSEError,
  SSETextDelta,
  SSEToolCall,
  SSEToolExecuting,
  SSEToolResult,
  TextSegment,
  ToolCallData,
  ToolConfirmation,
  ToolResultData,
  TurnSegment,
} from '../types';

let msgCounter = 0;
const nextId = () => `msg-${++msgCounter}`;

const UNDO_TOAST_DURATION = 8000;

type UseAssistReturn = {
  turns: AssistTurn[];
  isStreaming: boolean;
  send: (text: string, displayText?: string, onComplete?: () => void) => void;
  stop: () => void;
  confirm: (toolCallId: string, approved: boolean) => void;
  clear: () => void;
};

// ---------------------------------------------------------------------------
// Immutable turn helpers
// ---------------------------------------------------------------------------

function appendSegmentToTurn(turns: AssistTurn[], turnId: string, segment: TurnSegment): AssistTurn[] {
  return turns.map(t => (t.id === turnId ? { ...t, segments: [...t.segments, segment] } : t));
}

function updateSegment(
  turns: AssistTurn[],
  segmentId: string,
  updater: (seg: TurnSegment) => TurnSegment
): AssistTurn[] {
  return turns.map(t => ({
    ...t,
    segments: t.segments.map(s => (s.id === segmentId ? updater(s) : s)),
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAssist(pageContext: PageContext): UseAssistReturn {
  const [turns, setTurns] = useState<AssistTurn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const conversationRef = useRef<AssistMessage[]>([]);
  const pendingToolIdsRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const lastAssistantTurnIdRef = useRef('');

  const queryClient = useQueryClient();
  const router = useRouter();
  const setPendingNoteDiff = useAssistDiffStore(s => s.setPendingNoteDiff);
  const setPendingTestDiff = useAssistDiffStore(s => s.setPendingTestDiff);

  // -------------------------------------------------------------------------
  // Auto-reject pending confirmations when user sends a new message
  // -------------------------------------------------------------------------

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

    setTurns(prev =>
      prev.map(turn => ({
        ...turn,
        segments: turn.segments.map(seg =>
          seg.type === 'action_card' && seg.status === 'pending' ? { ...seg, status: 'rejected' as const } : seg
        ),
      }))
    );

    pendingToolIdsRef.current.clear();
  }, []);

  // -------------------------------------------------------------------------
  // SSE streaming
  // -------------------------------------------------------------------------

  const streamResponse = useCallback(
    async (request: AssistRequest, resumeTurnId?: string, onComplete?: () => void) => {
      setIsStreaming(true);
      abortRef.current = new AbortController();

      let activeTurnId: string;
      let activeTextSegmentId = '';
      let accumulatedText = '';
      let textSegmentOffset = 0;
      const toolCalls: ToolCallData[] = [];
      const toolResults: ToolResultData[] = [];

      if (resumeTurnId) {
        activeTurnId = resumeTurnId;
      } else {
        const turnId = nextId();
        activeTurnId = turnId;
        lastAssistantTurnIdRef.current = turnId;
        setTurns(prev => [...prev, { id: turnId, role: 'assistant', segments: [] }]);
      }

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
          const errorSeg: TurnSegment = { type: 'error', id: nextId(), message: error.detail ?? 'An error occurred' };
          setTurns(prev => appendSegmentToTurn(prev, activeTurnId, errorSeg));
          setIsStreaming(false);
          onComplete?.();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) return;

        await consumeSSEStream(reader, (event, data) => {
          handleSSEEvent(event, data);
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const errorSeg: TurnSegment = {
            type: 'error',
            id: nextId(),
            message: 'Connection lost. Please try again.',
          };
          setTurns(prev => appendSegmentToTurn(prev, activeTurnId, errorSeg));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        onComplete?.();
      }

      function handleSSEEvent(event: string, data: unknown): void {
        switch (event) {
          case 'text_delta': {
            const { content } = data as SSETextDelta;
            accumulatedText += content;

            setTurns(prev => {
              const turn = prev.find(t => t.id === activeTurnId);
              if (!turn) return prev;

              const lastSeg = turn.segments[turn.segments.length - 1];

              // Fast path: append to current text segment
              if (lastSeg?.type === 'text' && lastSeg.id === activeTextSegmentId) {
                return updateSegment(prev, activeTextSegmentId, seg => ({
                  ...seg,
                  content: accumulatedText.slice(textSegmentOffset),
                }));
              }

              // New text segment (first text, or text after a tool/action segment)
              const segId = nextId();
              activeTextSegmentId = segId;
              textSegmentOffset = accumulatedText.length - content.length;
              const newSeg: TextSegment = {
                type: 'text',
                id: segId,
                content,
                streaming: true,
              };
              return appendSegmentToTurn(prev, activeTurnId, newSeg);
            });
            break;
          }

          case 'tool_call': {
            const tc = data as SSEToolCall;
            toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.arguments });

            setTurns(prev => {
              // Finalize any streaming text segment
              let updated = activeTextSegmentId
                ? updateSegment(prev, activeTextSegmentId, seg =>
                    seg.type === 'text' ? { ...seg, streaming: false } : seg
                  )
                : prev;

              const toolSeg: TurnSegment = {
                type: 'tool_indicator',
                id: tc.id,
                name: tc.name,
                status: 'running',
              };
              updated = appendSegmentToTurn(updated, activeTurnId, toolSeg);
              return updated;
            });
            break;
          }

          case 'tool_executing': {
            const { id } = data as SSEToolExecuting;
            setTurns(prev =>
              updateSegment(prev, id, seg =>
                seg.type === 'tool_indicator' ? { ...seg, status: 'running' as const } : seg
              )
            );
            break;
          }

          case 'tool_result': {
            const tr = data as SSEToolResult;
            toolResults.push({ toolCallId: tr.id, output: tr.output });

            // Update tool indicator to done
            setTurns(prev => {
              let updated = updateSegment(prev, tr.id, seg =>
                seg.type === 'tool_indicator' ? { ...seg, status: 'done' as const } : seg
              );

              // Add tool result segment (suffixed ID to avoid collision with tool_indicator)
              const resultSeg: TurnSegment = {
                type: 'tool_result',
                id: `${tr.id}-result`,
                name: tr.name,
                output: tr.output,
                metadata: tr.metadata,
              };
              updated = appendSegmentToTurn(updated, activeTurnId, resultSeg);
              return updated;
            });

            // Side effects
            if (tr.name === 'navigate_to' && tr.metadata?.route) {
              router.push(tr.metadata.route);
            }

            if (isWriteTool(tr.name)) {
              const keys = getQueryKeysToInvalidate(tr.name);
              keys.forEach(key => void queryClient.invalidateQueries({ queryKey: key }));
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

            if (tr.name === 'refine_questions' && tr.metadata?.test_id && tr.metadata.questions) {
              setPendingTestDiff({
                testId: tr.metadata.test_id,
                questions: tr.metadata.questions,
                selectedIndices: tr.metadata.selected_indices ?? [],
              });
            }

            break;
          }

          case 'confirm_required': {
            const cr = data as SSEConfirmRequired;
            pendingToolIdsRef.current.add(cr.id);

            const actionSeg: TurnSegment = {
              type: 'action_card',
              id: cr.id,
              name: cr.name,
              arguments: cr.arguments,
              context: cr.context,
              status: 'pending',
            };
            setTurns(prev => appendSegmentToTurn(prev, activeTurnId, actionSeg));
            break;
          }

          case 'done': {
            void (data as SSEDone);
            // Finalize any streaming text segments in the active turn
            setTurns(prev =>
              prev.map(t =>
                t.id === activeTurnId
                  ? {
                      ...t,
                      segments: t.segments.map(seg =>
                        seg.type === 'text' && seg.streaming ? { ...seg, streaming: false } : seg
                      ),
                    }
                  : t
              )
            );

            const assistantMsg: AssistMessage = {
              role: 'assistant',
              content: accumulatedText,
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
            const errorSeg: TurnSegment = { type: 'error', id: nextId(), message };
            setTurns(prev => appendSegmentToTurn(prev, activeTurnId, errorSeg));
            break;
          }
        }
      }
    },
    [router, queryClient, setPendingNoteDiff, setPendingTestDiff]
  );

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const send = useCallback(
    (text: string, displayText?: string, onComplete?: () => void) => {
      if (!text.trim() || abortRef.current) return;

      resolvePendingConfirmations();

      const userMsg: AssistMessage = { role: 'user', content: text };
      conversationRef.current.push(userMsg);

      const userTurn: AssistTurn = {
        id: nextId(),
        role: 'user',
        segments: [{ type: 'text', id: nextId(), content: text, displayContent: displayText, streaming: false }],
      };
      setTurns(prev => [...prev, userTurn]);

      const request: AssistRequest = {
        messages: conversationRef.current,
        pageContext,
      };
      void streamResponse(request, undefined, onComplete);
    },
    [pageContext, streamResponse, resolvePendingConfirmations]
  );

  const confirm = useCallback(
    (toolCallId: string, approved: boolean) => {
      const otherPendingIds = [...pendingToolIdsRef.current].filter(id => id !== toolCallId);
      pendingToolIdsRef.current.clear();

      setTurns(prev =>
        prev.map(turn => ({
          ...turn,
          segments: turn.segments.map(seg => {
            if (seg.type !== 'action_card' || seg.status !== 'pending') return seg;
            if (seg.id === toolCallId)
              return { ...seg, status: approved ? ('approved' as const) : ('rejected' as const) };
            return { ...seg, status: 'rejected' as const };
          }),
        }))
      );

      const confirmations: ToolConfirmation[] = [{ toolCallId, approved }];
      otherPendingIds.forEach(id => confirmations.push({ toolCallId: id, approved: false }));

      if (!approved) {
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
      void streamResponse(request, lastAssistantTurnIdRef.current);
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
    setTurns([]);
    setIsStreaming(false);
  }, []);

  // -------------------------------------------------------------------------
  // Command-bridge callbacks (registered on the attachments store)
  // -------------------------------------------------------------------------

  const addLocalUserTurn = useCallback((text: string) => {
    setTurns(prev => [
      ...prev,
      {
        id: nextId(),
        role: 'user',
        segments: [{ type: 'text', id: nextId(), content: text, streaming: false }],
      },
    ]);
  }, []);

  const addLocalAssistantText = useCallback((text: string): string => {
    const turnId = nextId();
    const segId = nextId();
    lastAssistantTurnIdRef.current = turnId;
    setTurns(prev => [
      ...prev,
      {
        id: turnId,
        role: 'assistant',
        segments: [{ type: 'text', id: segId, content: text, streaming: false }],
      },
    ]);
    return segId;
  }, []);

  const removeSegment = useCallback((segmentId: string) => {
    setTurns(prev => {
      const updated = prev.map(turn => ({
        ...turn,
        segments: turn.segments.filter(s => s.id !== segmentId),
      }));
      return updated.filter(t => t.segments.length > 0);
    });
  }, []);

  const addLocalToolSegment = useCallback((name: string): string => {
    const segId = nextId();
    setTurns(prev => {
      const lastTurn = prev[prev.length - 1];
      if (lastTurn?.role === 'assistant') {
        return appendSegmentToTurn(prev, lastTurn.id, {
          type: 'tool_indicator',
          id: segId,
          name,
          status: 'running',
        });
      }
      const turnId = nextId();
      lastAssistantTurnIdRef.current = turnId;
      return [
        ...prev,
        {
          id: turnId,
          role: 'assistant',
          segments: [{ type: 'tool_indicator', id: segId, name, status: 'running' }],
        },
      ];
    });
    return segId;
  }, []);

  const updateToolSegmentStatus = useCallback((segmentId: string, status: 'done' | 'failed') => {
    setTurns(prev => updateSegment(prev, segmentId, seg => (seg.type === 'tool_indicator' ? { ...seg, status } : seg)));
  }, []);

  useEffect(() => {
    useAssistAttachmentsStore.getState().setCallbacks({
      addLocalMessage: addLocalUserTurn,
      addLocalAssistantMessage: addLocalAssistantText,
      removeMessage: removeSegment,
      addLocalToolCall: addLocalToolSegment,
      updateToolCallStatus: updateToolSegmentStatus,
    });
    return () => {
      useAssistAttachmentsStore.getState().setCallbacks({
        addLocalMessage: null,
        addLocalAssistantMessage: null,
        removeMessage: null,
        addLocalToolCall: null,
        updateToolCallStatus: null,
      });
    };
  }, [addLocalUserTurn, addLocalAssistantText, removeSegment, addLocalToolSegment, updateToolSegmentStatus]);

  return { turns, isStreaming, send, stop, confirm, clear };
}
