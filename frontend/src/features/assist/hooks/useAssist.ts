'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { sdk } from '@/lib/apiClient';

import { useAssistAttachmentsStore } from '../store/useAssistAttachmentsStore';
import { useAssistDiffStore } from '../store/useAssistDiffStore';
import { consumeSSEStream } from '../utils/sseStream';
import { getQueryKeysToInvalidate, isWriteTool } from '../utils/toolRegistry';

import { createStreamQueue } from './useStreamQueue';

import type { StreamQueueHandle } from './useStreamQueue';
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
  const queueRef = useRef<StreamQueueHandle | null>(null);

  // Safety net: cancel any in-flight reveal timers if the panel unmounts
  // mid-stream (the normal path is done/error/abort tearing the queue down).
  useEffect(() => {
    return () => {
      queueRef.current?.destroy();
    };
  }, []);

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
      let receivedDone = false;
      // Tracks wire order directly instead of reading (delayed, gated) `turns`
      // state — a boundary event closes the open segment synchronously, the
      // moment it's parsed, regardless of when its own queued `run()` fires.
      let textSegmentOpen = false;
      const toolCalls: ToolCallData[] = [];
      const toolResults: ToolResultData[] = [];

      const queue = createStreamQueue({
        // Upsert: the queue only calls this once a text item reaches the head
        // of its FIFO (i.e. every boundary ahead of it has already run), so
        // creating the segment here — rather than eagerly in `text_delta` —
        // is what keeps `turns` insertion order matching wire order.
        updateTextSegment: (segmentId, content, streaming) => {
          setTurns(prev => {
            const turn = prev.find(t => t.id === activeTurnId);
            const exists = turn?.segments.some(s => s.id === segmentId) ?? false;
            if (exists) {
              return updateSegment(prev, segmentId, seg =>
                seg.type === 'text' ? { ...seg, content, streaming } : seg
              );
            }
            const newSeg: TextSegment = { type: 'text', id: segmentId, content, streaming };
            return appendSegmentToTurn(prev, activeTurnId, newSeg);
          });
        },
      });
      queueRef.current = queue;

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
        // A clean `done` event finalizes streaming state itself (gated behind
        // the last text segment's reveal, see the 'done' case below) — only
        // handle cleanup here for the abort/error paths, where `done` never
        // arrives and any in-progress reveal must snap instantly (R6/C6).
        if (!receivedDone) {
          queue.flush();
          setIsStreaming(false);
          abortRef.current = null;
          queueRef.current = null;
          onComplete?.();
        }
      }

      function handleSSEEvent(event: string, data: unknown): void {
        switch (event) {
          case 'text_delta': {
            const { content } = data as SSETextDelta;
            accumulatedText += content;

            // Continuation is decided from wire order (this flag), never from
            // `turns` state — that state only catches up once the queue's
            // reveal/gating has actually run, which can lag several rounds
            // behind the parser (P0-1).
            if (!textSegmentOpen) {
              activeTextSegmentId = nextId();
              textSegmentOffset = accumulatedText.length - content.length;
              textSegmentOpen = true;
            }

            queue.extendTarget(activeTextSegmentId, accumulatedText.slice(textSegmentOffset));
            break;
          }

          case 'tool_call': {
            const tc = data as SSEToolCall;
            toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.arguments });
            textSegmentOpen = false;

            const toolSeg: TurnSegment = {
              type: 'tool_indicator',
              id: tc.id,
              name: tc.name,
              status: 'running',
            };
            queue.enqueue('tool_call', () => {
              setTurns(prev => appendSegmentToTurn(prev, activeTurnId, toolSeg));
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
            textSegmentOpen = false;

            queue.enqueue('tool_result', () => {
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

              if (tr.name === 'edit_test' && tr.metadata?.removedQuestionIds?.length) {
                const ids = tr.metadata.removedQuestionIds;
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

              if (tr.name === 'refine_note' && tr.metadata?.noteId && tr.metadata.oldContent != null) {
                setPendingNoteDiff({
                  noteId: tr.metadata.noteId,
                  oldContent: tr.metadata.oldContent,
                  newContent: tr.metadata.newContent ?? '',
                });
              }

              if (tr.name === 'refine_questions' && tr.metadata?.testId && tr.metadata.questions) {
                setPendingTestDiff({
                  testId: tr.metadata.testId,
                  questions: tr.metadata.questions,
                  selectedIndices: tr.metadata.selectedIndices ?? [],
                });
              }
            });
            break;
          }

          case 'confirm_required': {
            const cr = data as SSEConfirmRequired;
            pendingToolIdsRef.current.add(cr.id);
            textSegmentOpen = false;

            const actionSeg: TurnSegment = {
              type: 'action_card',
              id: cr.id,
              name: cr.name,
              arguments: cr.arguments,
              context: cr.context,
              status: 'pending',
            };
            queue.enqueue('confirm_required', () => {
              setTurns(prev => appendSegmentToTurn(prev, activeTurnId, actionSeg));
            });
            break;
          }

          case 'done': {
            void (data as SSEDone);
            receivedDone = true;
            textSegmentOpen = false;

            queue.enqueue('done', () => {
              // Finalize any streaming text segments in the active turn
              // (normally already false by the time reveal caught up, this
              // is just a safety net).
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

              // Turn fully revealed and finalized — safe to unlock input now (C7).
              setIsStreaming(false);
              abortRef.current = null;
              queueRef.current = null;
              onComplete?.();
            });
            break;
          }

          case 'error': {
            const { message } = data as SSEError;
            const errorSeg: TurnSegment = { type: 'error', id: nextId(), message };
            queue.runImmediately(() => {
              setTurns(prev => appendSegmentToTurn(prev, activeTurnId, errorSeg));
            });
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
    queueRef.current?.flush();

    pendingToolIdsRef.current.clear();

    setTurns(prev => {
      const updated = prev.map(turn => ({
        ...turn,
        segments: turn.segments.map(seg => {
          if (seg.type === 'tool_indicator' && seg.status === 'running') return { ...seg, status: 'stopped' as const };
          if (seg.type === 'action_card' && seg.status === 'pending') return { ...seg, status: 'rejected' as const };
          if (seg.type === 'text' && seg.streaming) return { ...seg, streaming: false };
          return seg;
        }),
      }));

      const lastAssistIdx = updated.findLastIndex(t => t.role === 'assistant');
      if (lastAssistIdx >= 0) {
        updated[lastAssistIdx] = {
          ...updated[lastAssistIdx],
          segments: [...updated[lastAssistIdx].segments, { type: 'stopped', id: nextId() }],
        };
      }

      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    queueRef.current?.destroy();
    queueRef.current = null;
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
