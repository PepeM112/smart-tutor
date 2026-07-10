'use client';

import { ChevronsLeftRight } from 'lucide-react';

import { useResizableSplit } from '@/features/history/hooks/use-resizable-split';

import { MarkdownRenderer } from './markdown-renderer';

import type { KeyboardEvent } from 'react';

type Props = {
  content: string;
  onChange: (content: string) => void;
};

const SPLIT_KEY = 'note-editor-split-ratio';
const DEFAULT_RATIO = 0.5;

const WRAP_CHARS: Record<string, string> = { '*': '*', '`': '`', '~': '~~' };

function handleEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, onChange: (value: string) => void) {
  const ta = e.currentTarget;
  const { selectionStart, selectionEnd, value } = ta;

  if (e.key === 'Tab') {
    e.preventDefault();
    const spaces = '    ';
    const next = value.slice(0, selectionStart) + spaces + value.slice(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = selectionStart + spaces.length;
    });
    return;
  }

  const wrap = WRAP_CHARS[e.key];
  if (wrap && selectionStart !== selectionEnd) {
    e.preventDefault();
    const selected = value.slice(selectionStart, selectionEnd);
    const next = value.slice(0, selectionStart) + wrap + selected + wrap + value.slice(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = selectionStart + wrap.length;
      ta.selectionEnd = selectionEnd + wrap.length;
    });
  }
}

export function NoteEditor({ content, onChange }: Props) {
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio } = useResizableSplit(SPLIT_KEY, DEFAULT_RATIO);

  return (
    <div ref={containerRef} className="flex h-full gap-0">
      {/* Editor panel */}
      <div className="min-w-0 overflow-y-auto scrollbar-none rounded-lg border border-border" style={{ flex: splitRatio }}>
        <textarea
          value={content}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => handleEditorKeyDown(e, onChange)}
          placeholder="Start writing in Markdown..."
          className="w-full h-full resize-none bg-transparent p-6 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          spellCheck={false}
        />
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

      {/* Preview panel */}
      <div
        className="min-w-0 overflow-y-auto scrollbar-none rounded-lg border border-border bg-card p-6"
        style={{ flex: 1 - splitRatio }}
      >
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">Preview will appear here...</p>
        )}
      </div>
    </div>
  );
}
