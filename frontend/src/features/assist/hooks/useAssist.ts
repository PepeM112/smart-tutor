'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { sdk } from '@/lib/apiClient';

import { useAssistAttachmentsStore } from '../store/useAssistAttachmentsStore';
import { useAssistDiffStore } from '../store/useAssistDiffStore';
import { buildInterruptedMessages, buildStreamMessages } from '../utils/buildStreamMessages';
import { consumeSSEStream } from '../utils/sseStream';
import { getQueryKeysToInvalidate, isWriteTool } from '../utils/toolRegistry';

import { AI_PERMISSIONS_QUERY_KEY } from './useAiToolPermissions';
import { createStreamQueue } from './useStreamQueue';

import type { StreamQueueHandle } from './useStreamQueue';
import type {
  AssistMessage,
  AssistRequest,
  AssistTurn,
  ConfirmHandler,
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
  send: (text: string, displayText?: string) => void;
  stop: () => void;
  confirm: ConfirmHandler;
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
  // Pending confirmation card id -> tool name (needed to approve every card of one tool).
  const pendingToolIdsRef = useRef<Map<string, string>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const lastAssistantTurnIdRef = useRef('');
  const queueRef = useRef<StreamQueueHandle | null>(null);

  // Safety net: if the panel unmounts mid-stream (e.g. logout), stop the request so the backend
  // stops generating, and cancel any in-flight reveal timers (the normal path is done/error/abort
  // tearing the queue down).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      queueRef.current?.destroy();
    };
  }, []);

  const queryClient = useQueryClient();
  const t = useTranslations('settings');
  const tAssist = useTranslations('assist');
  const router = useRouter();
  const setPendingNoteDiff = useAssistDiffStore(s => s.setPendingNoteDiff);
  const setPendingTestDiff = useAssistDiffStore(s => s.setPendingTestDiff);

  // -------------------------------------------------------------------------
  // Auto-reject pending confirmations when user sends a new message
  // -------------------------------------------------------------------------

  const resolvePendingConfirmations = useCallback(() => {
    if (pendingToolIdsRef.current.size === 0) return;

    const rejectedResults: ToolResultData[] = [...pendingToolIdsRef.current.keys()].map(id => ({
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
    /**
     * `prepare` runs before the request, while the hook is already busy: `send` and `confirm` are
     * locked, and Stop aborts the stream before it starts.
     */
    async (request: AssistRequest, resumeTurnId?: string, prepare?: () => Promise<void>) => {
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

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
        await prepare?.();
        const response = await fetch('/api/v1/assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = (await response.json().catch(() => ({ detail: tAssist('request_failed') }))) as {
            detail?: string;
          };
          const errorSeg: TurnSegment = {
            type: 'error',
            id: nextId(),
            message: error.detail ?? tAssist('error_generic'),
          };
          setTurns(prev => appendSegmentToTurn(prev, activeTurnId, errorSeg));
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
            message: tAssist('connection_lost'),
          };
          setTurns(prev => appendSegmentToTurn(prev, activeTurnId, errorSeg));
        }
      } finally {
        // A clean `done` event finalizes streaming state itself (gated behind
        // the last text segment's reveal, see the 'done' case below) — only
        // handle cleanup here for the abort/error paths, where `done` never
        // arrives and any in-progress reveal must snap instantly (R6/C6).
        // Only the stream that owns `abortRef` may tear down. After "Clear chat" a new stream can
        // already own it, and an old stream must not reset the new one.
        if (!receivedDone && abortRef.current === controller) {
          // The approved tool of a resumed stream may have run already: its tool call still
          // needs a result in the history, or the next request fails.
          conversationRef.current.push(...buildInterruptedMessages(request.toolConfirmations ?? [], toolResults));
          queue.flush();
          setIsStreaming(false);
          abortRef.current = null;
          queueRef.current = null;
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
            queue.enqueue('tool_executing', () => {
              setTurns(prev =>
                updateSegment(prev, id, seg =>
                  seg.type === 'tool_indicator' ? { ...seg, status: 'running' as const } : seg
                )
              );
            });
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
                toast(tAssist('questions_removed'), {
                  description: tAssist('questions_removed_description', { count: ids.length }),
                  duration: UNDO_TOAST_DURATION,
                  action: {
                    label: tAssist('undo'),
                    onClick: () => {
                      void sdk
                        .questionsBulkRestore({ body: { questionIds: ids } })
                        .then(() => {
                          void queryClient.invalidateQueries({ queryKey: ['tests'] });
                          void queryClient.invalidateQueries({ queryKey: ['questions'] });
                          toast.success(tAssist('questions_restored'));
                        })
                        .catch(() => toast.error(tAssist('questions_restore_failed')));
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
            pendingToolIdsRef.current.set(cr.id, cr.name);
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

              conversationRef.current.push(
                ...buildStreamMessages({
                  text: accumulatedText,
                  toolCalls,
                  toolResults,
                  confirmations: request.toolConfirmations ?? undefined,
                })
              );

              // Turn fully revealed and finalized — safe to unlock input now (C7).
              // Same owner check as in `finally`: an old stream must not reset a new one.
              if (abortRef.current === controller) {
                setIsStreaming(false);
                abortRef.current = null;
                queueRef.current = null;
              }
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
    [router, queryClient, setPendingNoteDiff, setPendingTestDiff, tAssist]
  );

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const send = useCallback(
    (text: string, displayText?: string) => {
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
      void streamResponse(request);
    },
    [pageContext, streamResponse, resolvePendingConfirmations]
  );

  const confirm: ConfirmHandler = useCallback(
    (toolCallId, approved, options) => {
      // The stream that asked is still open until its `done` is handled: the assistant message with
      // the tool calls is not in the history yet, so a resume now would break the conversation.
      if (abortRef.current) return;

      const pending = new Map(pendingToolIdsRef.current);
      pendingToolIdsRef.current.clear();

      // "Always allow" also approves the other pending cards of the same tool in this round.
      // Without it they would be rejected, and the user would have to answer each one again.
      const toolName = pending.get(toolCallId);
      const alwaysAllow = approved && options?.alwaysAllow === true && toolName !== undefined;
      const isApproved = (id: string): boolean =>
        id === toolCallId ? approved : alwaysAllow && pending.get(id) === toolName;

      setTurns(prev =>
        prev.map(turn => ({
          ...turn,
          segments: turn.segments.map(seg => {
            if (seg.type !== 'action_card' || seg.status !== 'pending') return seg;
            return { ...seg, status: isApproved(seg.id) ? ('approved' as const) : ('rejected' as const) };
          }),
        }))
      );

      const confirmations: ToolConfirmation[] = [
        toolCallId,
        ...[...pending.keys()].filter(id => id !== toolCallId),
      ].map(id => ({ toolCallId: id, approved: isApproved(id) }));

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

      // "Always allow" saves the permission before the request, so the resumed stream already
      // reads it. It runs inside the stream (`prepare`), so the hook is busy during the save.
      // If saving fails, this call still runs: the user approved it.
      const savePermission =
        alwaysAllow && toolName !== undefined
          ? () =>
              sdk
                .usersUpdateAiToolPermissions({ body: { permissions: { [toolName]: true } } })
                .then(() => void queryClient.invalidateQueries({ queryKey: AI_PERMISSIONS_QUERY_KEY }))
                .catch(() => void toast.error(t('ai_permissions_save_failed')))
          : undefined;

      const request: AssistRequest = {
        messages: conversationRef.current,
        pageContext,
        toolConfirmations: confirmations,
      };
      void streamResponse(request, lastAssistantTurnIdRef.current, savePermission);
    },
    [pageContext, streamResponse, queryClient, t]
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
    // Destroy drops a queued `done` item, which is the only code that frees the stream lock.
    // Free it here, or `send` and `confirm` stay blocked.
    abortRef.current = null;
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
