'use client';

import { Eye, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { markdownComponents } from './markdown-components';

import type { Element, Root } from 'hast';

// Tags rendered elements with source offsets so a text selection can map back to the markdown range (for AI edit)
function rehypeSourcePositions() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.position) {
        node.properties ??= {};
        node.properties['data-md-start'] = node.position.start.offset;
        node.properties['data-md-end'] = node.position.end.offset;
      }
    });
  };
}

// ── Wrap chars for editor keyboard shortcuts ────────────────────────

// '~' doubles to '~~' because GFM strikethrough needs two tildes
const WRAP_CHARS: Record<string, string> = { '*': '*', '`': '`', '~': '~~' };

// ── Component ───────────────────────────────────────────────────────

type Props = {
  content: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
  className?: string;
  onViewContainerChange?: (el: HTMLDivElement | null) => void;
  onTapView?: () => void;
  mode?: 'view' | 'edit';
  onModeChange?: (mode: 'view' | 'edit') => void;
};

export function MarkdownEditor({
  content,
  onChange,
  readOnly,
  className,
  onViewContainerChange,
  onTapView,
  mode: controlledMode,
  onModeChange,
}: Props) {
  const t = useTranslations();
  const viewRef = useRef<HTMLDivElement>(null);
  const [internalMode, setInternalMode] = useState<'view' | 'edit'>('view');
  const isControlled = controlledMode !== undefined;
  const mode = controlledMode ?? internalMode;
  const canToggle = !readOnly && !!onChange;

  const viewCallbackRef = useCallback(
    (el: HTMLDivElement | null) => {
      viewRef.current = el;
      onViewContainerChange?.(el);
    },
    [onViewContainerChange]
  );

  const isViewMode = mode === 'view' || !canToggle;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!onChange) return;
    const { selectionStart, selectionEnd, value } = e.currentTarget;

    if (e.key === 'Tab') {
      e.preventDefault();
      const spaces = '    ';
      onChange(value.slice(0, selectionStart) + spaces + value.slice(selectionEnd));
      requestAnimationFrame(() => {
        e.currentTarget.selectionStart = selectionStart + spaces.length;
        e.currentTarget.selectionEnd = selectionStart + spaces.length;
      });
      return;
    }

    const wrap = WRAP_CHARS[e.key];
    if (wrap && selectionStart !== selectionEnd) {
      e.preventDefault();
      const selected = value.slice(selectionStart, selectionEnd);
      onChange(value.slice(0, selectionStart) + wrap + selected + wrap + value.slice(selectionEnd));
      requestAnimationFrame(() => {
        e.currentTarget.selectionStart = selectionStart + wrap.length;
        e.currentTarget.selectionEnd = selectionEnd + wrap.length;
      });
    }
  }

  return (
    <div className={cn('relative h-full', className)}>
      {canToggle && !isControlled && (
        <div className="absolute top-3 right-3 z-10">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={e => {
              e.stopPropagation();
              const next = mode === 'view' ? 'edit' : 'view';
              setInternalMode(next);
              onModeChange?.(next);
            }}
            tooltip={mode === 'view' ? t('notes.edit_markdown') : t('notes.preview')}
            className="text-muted-foreground"
          >
            {mode === 'view' ? <Pencil className="size-4" /> : <Eye className="size-4" />}
          </Button>
        </div>
      )}

      {isViewMode ? (
        <div
          ref={viewCallbackRef}
          className={cn(
            'h-full overflow-y-auto overflow-x-hidden scrollbar-none p-4 lg:p-6',
            onTapView && 'cursor-pointer'
          )}
          onClick={onTapView}
        >
          {content ? (
            <div className="markdown-body max-w-none text-sm text-foreground">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSourcePositions]}
                components={markdownComponents}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/50 italic">{t('notes.start_writing')}</p>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={e => onChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('notes.start_writing')}
          className="w-full h-full resize-none scrollbar-none bg-transparent p-4 lg:p-6 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          spellCheck={false}
          autoFocus
        />
      )}
    </div>
  );
}
