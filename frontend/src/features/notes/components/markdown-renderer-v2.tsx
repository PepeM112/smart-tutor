'use client';

import { Eye, Pencil } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react';
import { type Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { Element, Root } from 'hast';

// ── Rehype plugin: stamp source positions on HTML elements ──────────

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

// ── Markdown components (shared with V1) ────────────────────────────

const markdownComponents: Components = {
  code({ className: codeClassName, children, ...props }) {
    const match = /language-(\w+)/.exec(codeClassName ?? '');
    const code = (typeof children === 'string' ? children : '').replace(/\n$/, '');

    if (match) {
      return (
        <SyntaxHighlighter language={match[1]} style={oneDark} PreTag="div">
          {code}
        </SyntaxHighlighter>
      );
    }

    return (
      <code className={codeClassName} {...props}>
        {children}
      </code>
    );
  },
};

// ── Wrap chars for editor keyboard shortcuts ────────────────────────

const WRAP_CHARS: Record<string, string> = { '*': '*', '`': '`', '~': '~~' };

// ── Component ───────────────────────────────────────────────────────

export type MarkdownRendererV2Handle = {
  viewContainer: HTMLDivElement | null;
};

type Props = {
  content: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
  className?: string;
};

export const MarkdownRendererV2 = forwardRef<MarkdownRendererV2Handle, Props>(
  function MarkdownRendererV2({ content, onChange, readOnly, className }, ref) {
    const viewRef = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const canToggle = !readOnly && !!onChange;

    useImperativeHandle(ref, () => ({
      get viewContainer() {
        return viewRef.current;
      },
    }));

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
        {canToggle && (
          <div className="absolute top-3 right-3 z-10">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMode(m => (m === 'view' ? 'edit' : 'view'))}
              tooltip={mode === 'view' ? 'Edit markdown' : 'Preview'}
              className="text-muted-foreground"
            >
              {mode === 'view' ? <Pencil className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        )}

        {mode === 'view' || !canToggle ? (
          <div
            ref={viewRef}
            className="h-full overflow-y-auto scrollbar-none p-6"
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
              <p className="text-sm text-muted-foreground/50 italic">Start writing in Markdown...</p>
            )}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={e => onChange?.(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Start writing in Markdown..."
            className="w-full h-full resize-none scrollbar-none bg-transparent p-6 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            spellCheck={false}
            autoFocus
          />
        )}
      </div>
    );
  },
);
