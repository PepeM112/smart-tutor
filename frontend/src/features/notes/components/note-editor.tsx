'use client';

import { useMutation } from '@tanstack/react-query';
import { ChevronsLeftRight, WandSparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { Textarea } from '@/components/ui/textarea';
import { useResizableSplit } from '@/hooks/use-resizable-split';
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

export function NoteEditor({ content, onChange, noteId }: Props) {
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio } = useResizableSplit(SPLIT_KEY, DEFAULT_RATIO);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  const [selectionTrigger, setSelectionTrigger] = useState<SelectionTrigger | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [diff, setDiff] = useState<DiffState | null>(null);

  const popoverOpenRef = useRef(popoverOpen);
  const diffRef = useRef(diff);

  useEffect(() => {
    popoverOpenRef.current = popoverOpen;
    diffRef.current = diff;
  }, [popoverOpen, diff]);

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
      if (popoverOpenRef.current || diffRef.current) return;

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
      setDiff({ selectedText: selectionTrigger.text, editedText: data.editedText });
      setPopoverOpen(false);
      setSelectionTrigger(null);
      setInstructions('');
    },
    onError: () => toast.error('Failed to edit selection. Please try again.'),
  });

  function handleAcceptDiff() {
    if (!diff) return;
    const idx = content.indexOf(diff.selectedText);
    if (idx === -1) {
      toast.error('Could not locate the original text — it may have changed.');
      setDiff(null);
      return;
    }
    onChange(content.slice(0, idx) + diff.editedText + content.slice(idx + diff.selectedText.length));
    setDiff(null);
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
        {diff && (
          <div className="mb-4 rounded-md bg-primary/10 px-3 py-2 text-xs text-foreground">
            Review AI edit in the right panel
          </div>
        )}
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">Preview will appear here...</p>
        )}
      </div>

      {/* Divider */}
      <div
        className="shrink-0 relative flex items-center justify-center w-12 cursor-col-resize"
        onMouseDown={handleDividerMouseDown}
        onDoubleClick={resetRatio}
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
        <div className="relative z-10 flex items-center justify-center w-6 h-10 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground transition-colors">
          <ChevronsLeftRight className="size-5" />
        </div>
      </div>

      {/* Editor panel / diff review panel */}
      <div className="min-w-0 overflow-hidden rounded-lg border border-border" style={{ flex: 1 - splitRatio }}>
        {diff ? (
          <div className="flex h-full flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none bg-muted p-4">
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Original</p>
              <MarkdownRenderer content={diff.selectedText} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none border-t border-border bg-primary/10 p-4">
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">AI Edit</p>
              <MarkdownRenderer content={diff.editedText} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border p-3">
              <Button variant="outline" onClick={() => setDiff(null)}>
                Cancel
              </Button>
              <Button onClick={handleAcceptDiff}>Accept</Button>
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
