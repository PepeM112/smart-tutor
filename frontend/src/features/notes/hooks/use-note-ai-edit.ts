'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTextHighlight } from '@/hooks/use-text-highlight';
import { sdk } from '@/lib/api-client';
import { getErrorDetail } from '@/lib/utils';

import { getMarkdownRangeFromSelection } from '../utils/markdown-selection';

export type SelectionTrigger = {
  plainText: string;
  markdown: string;
  markdownStart: number;
  markdownEnd: number;
  top: number;
  left: number;
};

export type DiffState = {
  selectedText: string;
  originalMarkdown: string;
  markdownStart: number;
  markdownEnd: number;
  editedText: string;
};

type UseNoteAiEditParams = {
  content: string;
  onChange: (content: string) => void;
  noteId?: string;
  viewContainerRef: React.RefObject<HTMLDivElement | null>;
  isDesktop: boolean;
};

export function useNoteAiEdit({ content, onChange, noteId, viewContainerRef, isDesktop }: UseNoteAiEditParams) {
  const t = useTranslations();

  const [selectionTrigger, setSelectionTrigger] = useState<SelectionTrigger | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [diffs, setDiffs] = useState<DiffState[]>([]);
  const [activeDiffIndex, setActiveDiffIndex] = useState<number | null>(null);

  const popoverOpenRef = useRef(popoverOpen);
  useEffect(() => {
    popoverOpenRef.current = popoverOpen;
  }, [popoverOpen]);

  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const highlightTexts = useMemo(() => diffs.map(d => d.selectedText), [diffs]);
  const handleHighlightClick = useCallback((index: number) => setActiveDiffIndex(index), []);
  const highlightHandle = useTextHighlight(viewContainerRef, highlightTexts, activeDiffIndex, handleHighlightClick);

  const activeDiff = activeDiffIndex !== null ? diffs[activeDiffIndex] : null;

  // ── Selection detection (desktop only) ─────────────────────────

  useEffect(() => {
    if (!noteId || !isDesktop || !viewContainerRef.current) return;
    const container = viewContainerRef.current;

    function commitSelection() {
      if (popoverOpenRef.current) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.anchorNode || !container.contains(sel.anchorNode)) {
        setSelectionTrigger(null);
        return;
      }

      const plainText = sel.toString().trim();
      if (!plainText) {
        setSelectionTrigger(null);
        return;
      }

      const range = getMarkdownRangeFromSelection(container, contentRef.current);
      if (!range) {
        setSelectionTrigger(null);
        return;
      }

      const rects = sel.getRangeAt(0).getClientRects();
      const lastRect = rects[rects.length - 1];
      if (!lastRect) return;
      setSelectionTrigger({
        plainText,
        markdown: range.markdown,
        markdownStart: range.start,
        markdownEnd: range.end,
        top: lastRect.top + lastRect.height / 2,
        left: lastRect.right,
      });
    }

    function handleMouseUp() {
      requestAnimationFrame(commitSelection);
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') commitSelection();
    }

    function handleSelectionChange() {
      if (popoverOpenRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setSelectionTrigger(null);
    }

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    container.addEventListener('scroll', commitSelection, { passive: true });
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      container.removeEventListener('scroll', commitSelection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewContainerRef.current is read as the "container mounted" signal
  }, [noteId, isDesktop, viewContainerRef.current]);

  // ── Handlers ────────────────────────────────────────────────────

  function handleOpenChange(open: boolean) {
    setPopoverOpen(open);
    if (!open) {
      setSelectionTrigger(null);
      setInstructions('');
    }
  }

  function removeDiff(index: number) {
    setDiffs(prev => prev.filter((_, i) => i !== index));
    setActiveDiffIndex(null);
  }

  const { mutate: editChunk, isPending: isSubmittingEdit } = useMutation({
    mutationFn: async () => {
      if (!noteId || !selectionTrigger) return null;
      const res = await sdk.notesEditChunk({
        path: { note_id: noteId },
        body: {
          fullText: content,
          selectedText: selectionTrigger.markdown,
          instructions,
        },
      });
      return res.data;
    },
    onSuccess: data => {
      if (!data || !selectionTrigger) return;
      setDiffs(prev => [
        ...prev,
        {
          selectedText: selectionTrigger.plainText,
          originalMarkdown: selectionTrigger.markdown,
          markdownStart: selectionTrigger.markdownStart,
          markdownEnd: selectionTrigger.markdownEnd,
          editedText: data.editedText,
        },
      ]);
      setPopoverOpen(false);
      setSelectionTrigger(null);
      setInstructions('');
    },
    onError: (error: unknown) => toast.error(getErrorDetail(error, t('notes_ai.failed_to_edit'))),
  });

  function handleAcceptDiff() {
    if (activeDiffIndex === null || !activeDiff) return;
    const { markdownStart, markdownEnd, originalMarkdown, editedText } = activeDiff;
    // Bail if the source text moved since this diff was computed — stored offsets would splice the wrong range
    if (content.slice(markdownStart, markdownEnd) !== originalMarkdown) {
      toast.error(t('notes_ai.could_not_locate'));
      removeDiff(activeDiffIndex);
      return;
    }

    // Unwrap all <mark> elements BEFORE changing content — they're raw DOM
    // wrappers that crash React's reconciliation if present during re-render
    highlightHandle.clearHighlights();

    onChange(content.slice(0, markdownStart) + editedText + content.slice(markdownEnd));

    // Accepting this diff changes text length, so shift all pending diffs after it by the delta
    const delta = editedText.length - originalMarkdown.length;
    setDiffs(prev =>
      prev
        .filter((_, i) => i !== activeDiffIndex)
        .map(d =>
          d.markdownStart > markdownStart
            ? { ...d, markdownStart: d.markdownStart + delta, markdownEnd: d.markdownEnd + delta }
            : d
        )
    );
    setActiveDiffIndex(null);
  }

  return {
    selectionTrigger,
    popoverOpen,
    instructions,
    setInstructions,
    handleOpenChange,
    editChunk,
    isSubmittingEdit,
    diffs,
    activeDiffIndex,
    setActiveDiffIndex,
    activeDiff,
    removeDiff,
    handleAcceptDiff,
  };
}
