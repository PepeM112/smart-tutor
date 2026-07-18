'use client';

import { useMutation } from '@tanstack/react-query';
import { WandSparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { Textarea } from '@/components/ui/textarea';
import { useResizableSplit } from '@/hooks/use-resizable-split';
import { useTextHighlight } from '@/hooks/use-text-highlight';
import { sdk } from '@/lib/api-client';

import { getMarkdownRangeFromSelection } from '../utils/markdown-selection';

import { MarkdownRenderer } from './markdown-renderer';
import { MarkdownRendererV2 } from './markdown-renderer-v2';

type Props = {
  content: string;
  onChange: (content: string) => void;
  noteId?: string;
};

const SPLIT_KEY = 'note-editor-split-ratio';
const DEFAULT_RATIO = 0.5;

type SelectionTrigger = {
  plainText: string;
  markdown: string;
  markdownStart: number;
  markdownEnd: number;
  top: number;
  left: number;
};

type DiffState = {
  selectedText: string;
  originalMarkdown: string;
  markdownStart: number;
  markdownEnd: number;
  editedText: string;
};

export function NoteEditor({ content, onChange, noteId }: Props) {
  const viewContainerRef = useRef<HTMLDivElement | null>(null);
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio } = useResizableSplit(SPLIT_KEY, DEFAULT_RATIO);

  const [selectionTrigger, setSelectionTrigger] = useState<SelectionTrigger | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [diffs, setDiffs] = useState<DiffState[]>([]);
  const [activeDiffIndex, setActiveDiffIndex] = useState<number | null>(null);

  const popoverOpenRef = useRef(popoverOpen);
  useEffect(() => {
    popoverOpenRef.current = popoverOpen;
  }, [popoverOpen]);

  const handleViewContainerChange = useCallback((el: HTMLDivElement | null) => {
    viewContainerRef.current = el;
  }, []);

  const highlightTexts = useMemo(() => diffs.map(d => d.selectedText), [diffs]);
  const handleHighlightClick = useCallback((index: number) => setActiveDiffIndex(index), []);
  useTextHighlight(viewContainerRef, highlightTexts, activeDiffIndex, handleHighlightClick);

  const activeDiff = activeDiffIndex !== null ? diffs[activeDiffIndex] : null;
  const hasDiffPanel = activeDiff !== null;

  // ── Selection detection ─────────────────────────────────────────

  useEffect(() => {
    if (!noteId) return;

    function commitSelection() {
      if (popoverOpenRef.current) return;

      const container = viewContainerRef.current;
      if (!container) return;

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

      const range = getMarkdownRangeFromSelection(container, content);
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

    const container = viewContainerRef.current;

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    container?.addEventListener('scroll', commitSelection, { passive: true });
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      container?.removeEventListener('scroll', commitSelection);
    };
  }, [noteId, content]);

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
    onError: () => toast.error('Failed to edit selection. Please try again.'),
  });

  function handleAcceptDiff() {
    if (activeDiffIndex === null || !activeDiff) return;
    const { markdownStart, markdownEnd, originalMarkdown, editedText } = activeDiff;
    if (content.slice(markdownStart, markdownEnd) !== originalMarkdown) {
      toast.error('Could not locate the original text — it may have changed.');
      removeDiff(activeDiffIndex);
      return;
    }
    onChange(content.slice(0, markdownStart) + editedText + content.slice(markdownEnd));
    removeDiff(activeDiffIndex);
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="flex h-full gap-0">
      {/* Main pane: MarkdownRendererV2 (view/edit toggle built in) */}
      <div
        className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
        style={{ flex: hasDiffPanel ? splitRatio : 1 }}
      >
        <MarkdownRendererV2 content={content} onChange={onChange} onViewContainerChange={handleViewContainerChange} />
      </div>

      {/* Divider — only when diff panel is open */}
      {hasDiffPanel && (
        <div
          className="shrink-0 relative flex items-center justify-center w-5 mx-2 cursor-col-resize"
          onMouseDown={handleDividerMouseDown}
          onDoubleClick={resetRatio}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
          <div className="relative z-10 w-3 h-7 rounded-full border border-border bg-background" />
        </div>
      )}

      {/* Diff review panel — only when a diff is active */}
      {hasDiffPanel && (
        <div className="min-w-0 overflow-hidden rounded-lg border border-border" style={{ flex: 1 - splitRatio }}>
          <div className="flex h-full flex-col bg-card p-4">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-sm font-semibold text-foreground">Changes</h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setActiveDiffIndex(null)}
                className="text-muted-foreground"
              >
                <X className="size-4" />
              </Button>
            </div>

            <p className="text-xs font-medium text-muted-foreground mb-1.5 shrink-0">Old</p>
            <div className="rounded-md border border-feedback-wrong-border bg-feedback-wrong-bg p-3 overflow-y-auto scrollbar-none flex-1 min-h-0">
              <MarkdownRenderer content={activeDiff.originalMarkdown} />
            </div>

            <p className="text-xs font-medium text-muted-foreground mb-1.5 mt-3 shrink-0">New</p>
            <div className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg p-3 overflow-y-auto scrollbar-none flex-1 min-h-0">
              <MarkdownRenderer content={activeDiff.editedText} />
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => activeDiffIndex !== null && removeDiff(activeDiffIndex)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleAcceptDiff}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating AI edit trigger */}
      {selectionTrigger && (
        <div
          style={{
            position: 'fixed',
            top: selectionTrigger.top,
            left: selectionTrigger.left + 6,
            zIndex: 50,
            transform: 'translateY(-50%)',
          }}
        >
          <FloatingCard open={popoverOpen} onOpenChange={handleOpenChange}>
            <FloatingCardTrigger asChild>
              <Button size="icon" icon={WandSparkles} tooltip="Edit with AI" />
            </FloatingCardTrigger>
            <FloatingCardContent align="start" className="w-72 space-y-3">
              <Textarea
                autoFocus
                rows={3}
                placeholder="How should this text be edited?"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  icon={WandSparkles}
                  disabled={!instructions.trim() || isSubmittingEdit}
                  onClick={() => editChunk()}
                >
                  {isSubmittingEdit ? 'Editing...' : 'Edit'}
                </Button>
              </div>
            </FloatingCardContent>
          </FloatingCard>
        </div>
      )}
    </div>
  );
}
