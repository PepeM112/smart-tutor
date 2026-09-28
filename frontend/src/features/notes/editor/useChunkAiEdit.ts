'use client';

/**
 * AI chunk-edit hook for the rich note editor.
 *
 * Flow:
 *   1. Bubble menu fires onAskAi(ctx) → instruction popover opens (pendingSelection).
 *   2. User types instructions → submitInstructions() → sdk.notesEditChunk.
 *   3. Result stored in activeDiff → shown in DiffPanel / Drawer.
 *   4. Accept: replaceSelectionWithMarkdown with a stale-doc guard.
 *
 * Also registers in useAssistCommandBridgeStore so the assistant's /edit-note
 * command (a different subtree) can trigger the same diff flow.
 */

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useAssistCommandBridgeStore } from '@/features/assist/store/useAssistCommandBridge';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { replaceSelectionWithMarkdown, serializeMarkdown } from './markdown';

import type { SelectionContext } from './NoteBubbleMenu';
import type { RichNoteEditorRef } from './RichNoteEditor';

export type ChunkDiff = {
  /** Used to guard the accept step — must still match the doc at [from, to]. */
  originalPlainText: string;
  originalMarkdown: string;
  editedText: string;
  /** ProseMirror positions of the original selection. */
  from: number;
  to: number;
};

type UseChunkAiEditParams = {
  /** Stable ref to the RichNoteEditor — the hook reads .current.editor on each call. */
  editorRef: React.RefObject<RichNoteEditorRef | null>;
  noteId?: string;
};

export function useChunkAiEdit({ editorRef, noteId }: UseChunkAiEditParams) {
  const t = useTranslations();

  // Selection awaiting instructions — renders the instruction popover.
  const [pendingSelection, setPendingSelection] = useState<SelectionContext | null>(null);
  // Diff ready for review.
  const [activeDiff, setActiveDiff] = useState<ChunkDiff | null>(null);

  const { mutate: runEdit, isPending } = useMutation({
    mutationFn: async ({ ctx, instructions }: { ctx: SelectionContext; instructions: string }) => {
      const ed = editorRef.current?.editor;
      if (!noteId || !ed) throw new Error('editor not ready');
      const fullText = serializeMarkdown(ed);
      const res = await sdk.notesEditChunk({
        path: { note_id: noteId },
        body: { fullText, selectedText: ctx.markdown, instructions },
      });
      if (!res.data) throw new Error('empty response');
      return { editedText: res.data.editedText, ctx };
    },
    onSuccess: ({ editedText, ctx }) => {
      setActiveDiff({
        originalPlainText: ctx.plainText,
        originalMarkdown: ctx.markdown,
        editedText,
        from: ctx.from,
        to: ctx.to,
      });
    },
    onError: (err: unknown) => toast.error(getErrorDetail(err, t('notes_ai.failed_to_edit'))),
    onSettled: () => setPendingSelection(null),
  });

  const handleAskAi = useCallback((ctx: SelectionContext) => {
    setPendingSelection(ctx);
  }, []);

  const submitInstructions = useCallback(
    (instructions: string) => {
      if (!pendingSelection) return;
      runEdit({ ctx: pendingSelection, instructions });
    },
    [pendingSelection, runEdit]
  );

  const cancelInstructions = useCallback(() => setPendingSelection(null), []);

  const handleAcceptDiff = useCallback(() => {
    const diff = activeDiff;
    const ed = editorRef.current?.editor;
    if (!diff || !ed) return;

    // Stale-doc guard: the text at [from, to] must still equal what was selected.
    // This catches cases where the user typed while waiting for the AI response.
    const currentText = ed.state.doc.textBetween(diff.from, diff.to, ' ');
    if (currentText !== diff.originalPlainText) {
      toast.error(t('notes_ai.could_not_locate'));
      setActiveDiff(null);
      return;
    }

    replaceSelectionWithMarkdown(ed, diff.from, diff.to, diff.editedText);
    setActiveDiff(null);
  }, [activeDiff, editorRef, t]);

  const handleRejectDiff = useCallback(() => setActiveDiff(null), []);

  // ── Bridge: lets the assistant /edit-note command drive the same diff flow ──

  const runEditRef = useRef(runEdit);
  useEffect(() => {
    runEditRef.current = runEdit;
  }, [runEdit]);

  useEffect(() => {
    if (!noteId) return undefined;
    useAssistCommandBridgeStore.getState().setNoteEditRunner(params => {
      const ctx: SelectionContext = {
        markdown: params.markdown,
        plainText: params.plainText,
        // pmFrom/pmTo are set by onSendToAssistant when attaching a selection.
        from: params.pmFrom ?? 0,
        to: params.pmTo ?? 0,
        rect: new DOMRect(),
      };
      runEditRef.current({ ctx, instructions: params.instructions });
      params.onSettled?.();
    });
    return () => {
      useAssistCommandBridgeStore.getState().setNoteEditRunner(null);
    };
  }, [noteId]);

  return {
    pendingSelection,
    isPending,
    activeDiff,
    handleAskAi,
    submitInstructions,
    cancelInstructions,
    handleAcceptDiff,
    handleRejectDiff,
  };
}
