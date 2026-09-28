'use client';

/**
 * AI chunk-edit hook for the rich note editor.
 *
 * Flow:
 *   1. Bubble menu fires onAskAi(ctx) → instruction popover opens (pendingSelection).
 *   2. User types instructions → submitInstructions() → sdk.notesEditChunk.
 *      The selection gets a chunk highlight (useChunkHighlights) at submit time.
 *   3. Result stored in diffs and opened → shown in DiffPanel / Drawer.
 *      Close keeps the diff; a click on its highlight opens it again.
 *   4. Accept: replaceSelectionWithMarkdown at the highlight's current range,
 *      with a stale-doc guard. Accept / Reject remove the highlight.
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
import { useChunkHighlights } from './useChunkHighlights';

import type { SelectionContext } from './NoteBubbleMenu';
import type { RichNoteEditorRef } from './RichNoteEditor';

export type ChunkDiff = {
  /** Also the id of the chunk highlight, which holds the current range of the text. */
  id: string;
  /** Used to guard the accept step — must still match the highlighted text. */
  originalPlainText: string;
  originalMarkdown: string;
  editedText: string;
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
  // Diffs ready for review. Each one has a highlight in the editor; a click on it opens the diff.
  const [diffs, setDiffs] = useState<ChunkDiff[]>([]);
  const [activeDiffId, setActiveDiffId] = useState<string | null>(null);
  const activeDiff = diffs.find(d => d.id === activeDiffId) ?? null;
  const highlights = useChunkHighlights({ editorRef, activeId: activeDiffId, onClick: setActiveDiffId });

  const { mutate: runEdit, isPending } = useMutation({
    mutationFn: async ({ ctx, instructions }: { id: string; ctx: SelectionContext; instructions: string }) => {
      const ed = editorRef.current?.editor;
      if (!noteId || !ed) throw new Error('editor not ready');
      const fullText = serializeMarkdown(ed);
      const res = await sdk.notesEditChunk({
        path: { note_id: noteId },
        body: { fullText, selectedText: ctx.markdown, instructions },
      });
      if (!res.data) throw new Error('empty response');
      return res.data.editedText;
    },
    onSuccess: (editedText, { id, ctx }) => {
      highlights.markReady(id);
      setDiffs(prev => [...prev, { id, originalPlainText: ctx.plainText, originalMarkdown: ctx.markdown, editedText }]);
      setActiveDiffId(id);
    },
    onError: (err: unknown, { id }) => {
      highlights.remove(id);
      toast.error(getErrorDetail(err, t('notes_ai.failed_to_edit')));
    },
    onSettled: () => setPendingSelection(null),
  });

  /** Highlight the selection, then send it. The highlight keeps the range correct while the user types. */
  const startEdit = useCallback(
    (ctx: SelectionContext, instructions: string): boolean => {
      const id = crypto.randomUUID();
      if (!highlights.add(id, ctx.from, ctx.to)) {
        toast.error(t(ctx.to > ctx.from ? 'notes_ai.chunk_overlaps' : 'notes_ai.could_not_locate'));
        return false;
      }
      runEdit({ id, ctx, instructions });
      return true;
    },
    [highlights, runEdit, t]
  );

  const handleAskAi = useCallback((ctx: SelectionContext) => {
    setPendingSelection(ctx);
  }, []);

  const submitInstructions = useCallback(
    (instructions: string) => {
      if (!pendingSelection) return;
      if (!startEdit(pendingSelection, instructions)) setPendingSelection(null);
    },
    [pendingSelection, startEdit]
  );

  const cancelInstructions = useCallback(() => setPendingSelection(null), []);

  const discardDiff = useCallback(
    (id: string) => {
      highlights.remove(id);
      setDiffs(prev => prev.filter(d => d.id !== id));
      setActiveDiffId(null);
    },
    [highlights]
  );

  const handleAcceptDiff = useCallback(() => {
    const diff = activeDiff;
    const ed = editorRef.current?.editor;
    if (!diff || !ed) return;

    // Stale-doc guard: the highlight gives the current range. The text in it must still
    // equal what was selected (the user can edit inside the highlight, or delete it).
    const range = highlights.getRange(diff.id);
    if (!range || ed.state.doc.textBetween(range.from, range.to, ' ') !== diff.originalPlainText) {
      toast.error(t('notes_ai.could_not_locate'));
      discardDiff(diff.id);
      return;
    }

    replaceSelectionWithMarkdown(ed, range.from, range.to, diff.editedText);
    discardDiff(diff.id);
  }, [activeDiff, discardDiff, editorRef, highlights, t]);

  const handleRejectDiff = useCallback(() => {
    if (activeDiffId) discardDiff(activeDiffId);
  }, [activeDiffId, discardDiff]);

  /** Close the diff but keep it pending: a click on the highlight opens it again. */
  const handleHideDiff = useCallback(() => setActiveDiffId(null), []);

  // ── Bridge: lets the assistant /edit-note command drive the same diff flow ──

  const startEditRef = useRef(startEdit);
  useEffect(() => {
    startEditRef.current = startEdit;
  }, [startEdit]);

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
      startEditRef.current(ctx, params.instructions);
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
    handleHideDiff,
  };
}
