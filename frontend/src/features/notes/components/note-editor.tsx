'use client';

import { useMutation } from '@tanstack/react-query';
import { WandSparkles, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { Textarea } from '@/components/ui/textarea';
import { useResizableSplit } from '@/hooks/use-resizable-split';
import { useTextHighlight } from '@/hooks/use-text-highlight';
import { sdk } from '@/lib/api-client';

import { MarkdownRenderer } from './markdown-renderer';

type Props = {
  content: string;
  onChange: (content: string) => void;
  noteId?: string;
};

const SPLIT_KEY = 'note-editor-split-ratio';
const DEFAULT_RATIO = 0.5;

const WRAP_CHARS: Record<string, string> = { '*': '*', '`': '`', '~': '~~' };

type SelectionTrigger = { text: string; top: number; left: number };
type DiffState = { selectedText: string; editedText: string };

const MOCK_DIFF: DiffState = {
  selectedText:
    'Romanesque architecture emerged in the 6th century and flourished from approximately 1000 to 1150 CE across Europe. It represents a significant transition from the classical traditions of Rome and Early Christian styles toward the later Gothic period. The term "Romanesque" was coined in the 19th century by French historian Charles de Caumont to describe the architecture\'s derivation from Roman building traditions, though it evolved distinctly beyond its origins.',
  editedText:
    "Romanesque architecture emerged in the 6th century and flourished from approximately 1000 to 1150 CE across Europe, becoming one of the most influential architectural movements of the medieval period. It represents a significant transition from the classical traditions of Rome and Early Christian styles toward the later Gothic period, serving as a crucial bridge between antiquity and the High Middle Ages. The term \"Romanesque\" was coined in the 19th century by French historian Charles de Caumont to describe the architecture's derivation from Roman building traditions, though it evolved distinctly beyond its origins into a unique aesthetic that reflected the political, religious, and social conditions of medieval Europe. This period witnessed the construction of some of Europe's most iconic structures, from vast cathedrals to fortified abbey churches, each showcasing regional variations while sharing common structural and decorative principles. The style's enduring legacy extends beyond its own era, influencing subsequent architectural movements and continuing to define the medieval landscape of Europe today.",
};

// Change to [] to disable mock
const INITIAL_DIFFS: DiffState[] = [MOCK_DIFF];

export function NoteEditor({ content, onChange, noteId }: Props) {
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio } = useResizableSplit(SPLIT_KEY, DEFAULT_RATIO);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  const [selectionTrigger, setSelectionTrigger] = useState<SelectionTrigger | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [diffs, setDiffs] = useState<DiffState[]>(INITIAL_DIFFS);
  const [activeDiffIndex, setActiveDiffIndex] = useState<number | null>(INITIAL_DIFFS.length > 0 ? 0 : null);

  const popoverOpenRef = useRef(popoverOpen);

  useEffect(() => {
    popoverOpenRef.current = popoverOpen;
  }, [popoverOpen]);

  const highlightTexts = useMemo(() => diffs.map(d => d.selectedText), [diffs]);
  const handleHighlightClick = useCallback((index: number) => setActiveDiffIndex(index), []);
  useTextHighlight(previewRef, highlightTexts, activeDiffIndex, handleHighlightClick);

  const activeDiff = activeDiffIndex !== null ? diffs[activeDiffIndex] : null;

  useLayoutEffect(() => {
    if (pendingSelection.current && textareaRef.current) {
      textareaRef.current.selectionStart = pendingSelection.current.start;
      textareaRef.current.selectionEnd = pendingSelection.current.end;
      pendingSelection.current = null;
    }
  });

  useEffect(() => {
    if (!noteId) return;

    function handleSelectionChange() {
      if (popoverOpenRef.current) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.anchorNode || !previewRef.current?.contains(sel.anchorNode)) {
        setSelectionTrigger(null);
        return;
      }

      const text = sel.toString().trim();
      if (!text) {
        setSelectionTrigger(null);
        return;
      }

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setSelectionTrigger({ text, top: rect.bottom, left: rect.right });
    }

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [noteId]);

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
        body: { fullText: content, selectedText: selectionTrigger.text, instructions },
      });
      return res.data;
    },
    onSuccess: data => {
      if (!data || !selectionTrigger) return;
      setDiffs(prev => [...prev, { selectedText: selectionTrigger.text, editedText: data.editedText }]);
      setPopoverOpen(false);
      setSelectionTrigger(null);
      setInstructions('');
    },
    onError: () => toast.error('Failed to edit selection. Please try again.'),
  });

  function handleAcceptDiff() {
    if (activeDiffIndex === null || !activeDiff) return;
    const idx = content.indexOf(activeDiff.selectedText);
    if (idx === -1) {
      toast.error('Could not locate the original text — it may have changed.');
      removeDiff(activeDiffIndex);
      return;
    }
    onChange(content.slice(0, idx) + activeDiff.editedText + content.slice(idx + activeDiff.selectedText.length));
    removeDiff(activeDiffIndex);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const { selectionStart, selectionEnd, value } = e.currentTarget;

    if (e.key === 'Tab') {
      e.preventDefault();
      const spaces = '    ';
      onChange(value.slice(0, selectionStart) + spaces + value.slice(selectionEnd));
      pendingSelection.current = {
        start: selectionStart + spaces.length,
        end: selectionStart + spaces.length,
      };
      return;
    }

    const wrap = WRAP_CHARS[e.key];
    if (wrap && selectionStart !== selectionEnd) {
      e.preventDefault();
      const selected = value.slice(selectionStart, selectionEnd);
      onChange(value.slice(0, selectionStart) + wrap + selected + wrap + value.slice(selectionEnd));
      pendingSelection.current = {
        start: selectionStart + wrap.length,
        end: selectionEnd + wrap.length,
      };
    }
  }

  return (
    <div ref={containerRef} className="flex h-full gap-0">
      {/* Preview panel */}
      <div
        ref={previewRef}
        className="min-w-0 overflow-y-auto scrollbar-none rounded-lg border border-border bg-card p-6"
        style={{ flex: splitRatio }}
      >
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">Preview will appear here...</p>
        )}
      </div>

      {/* Divider */}
      <div
        className="shrink-0 relative flex items-center justify-center w-5 mx-2 cursor-col-resize"
        onMouseDown={handleDividerMouseDown}
        onDoubleClick={resetRatio}
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
        <div className="relative z-10 w-3 h-7 rounded-full border border-border bg-background" />
      </div>

      {/* Editor panel / diff review panel */}
      <div className="min-w-0 overflow-hidden rounded-lg border border-border" style={{ flex: 1 - splitRatio }}>
        {activeDiff ? (
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
              <MarkdownRenderer content={activeDiff.selectedText} />
            </div>

            <p className="text-xs font-medium text-muted-foreground mb-1.5 mt-3 shrink-0">New</p>
            <div className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg p-3 overflow-y-auto scrollbar-none flex-1 min-h-0">
              <MarkdownRenderer content={activeDiff.editedText} />
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
              <Button variant="outline" size="sm" onClick={() => removeDiff(activeDiffIndex!)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAcceptDiff}>
                Accept
              </Button>
            </div>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Start writing in Markdown..."
            className="w-full h-full resize-none scrollbar-none bg-transparent p-6 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            spellCheck={false}
          />
        )}
      </div>

      {/* Floating AI edit trigger */}
      {selectionTrigger && (
        <div style={{ position: 'fixed', top: selectionTrigger.top + 8, left: selectionTrigger.left, zIndex: 50 }}>
          <FloatingCard open={popoverOpen} onOpenChange={handleOpenChange}>
            <FloatingCardTrigger asChild>
              <Button size="icon-sm" icon={WandSparkles} tooltip="Edit with AI" />
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
