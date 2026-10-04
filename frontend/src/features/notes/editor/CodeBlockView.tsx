'use client';

// React NodeView for code blocks: the code plus a small toolbar in the top-right corner:
// wrap toggle, copy button and the language chip. The toolbar shows on hover and while the cursor
// is in the block (touch has no hover).
// The chip shows the readable name ("Python"). Click → a filterable list of the registered
// lowlight languages (search also finds aliases: "py", "yml"). "Auto" = no language, so lowlight
// guesses the highlight. The language is stored as the canonical ```lang fence.
// Wrap is view-only and not stored (it would only add noise to the Markdown). It lives in a ProseMirror plugin
// (`codeBlockWrap.ts`), so the block handle menu can read and change it too.

import { NodeViewContent, NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react';
import { Check, ChevronDown, Copy, WrapText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { HoverHint } from '@/components/ui/hover-hint';
import { cn } from '@/lib/utils';

import { buildToggleCodeWrapTransaction, isCodeWrapped } from './codeBlockWrap';
import { codeLanguageLabel, normalizeCodeLanguage, searchCodeLanguages } from './codeLanguages';
import { copyCode } from './copyCode';

import type { createLowlight } from 'lowlight';

type Lowlight = ReturnType<typeof createLowlight>;

export function CodeBlockView({ node, editor, extension, getPos, updateAttributes }: NodeViewProps) {
  const t = useTranslations('notes');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Set by an outside click: the user already put the cursor where they clicked, so the
  // close must not move it back into this block.
  const closedByOutside = useRef(false);
  const language = (node.attrs.language as string | null) ?? null;

  // True while the selection is inside this block. The editor does not re-render the
  // node view for a selection change, so read it from the editor state.
  const isActive = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const pos = getPos();
      if (typeof pos !== 'number') return false;
      const { from, to } = e.state.selection;
      return from > pos && to < pos + node.nodeSize;
    },
  });

  // Wrap comes from the plugin state, not from the node: read it from the editor state, like `isActive`.
  const wrap = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const pos = getPos();
      return typeof pos === 'number' && isCodeWrapped(e.state, pos);
    },
  });

  const toggleWrap = () => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const tr = buildToggleCodeWrapTransaction(editor.state, pos);
    if (tr) editor.view.dispatch(tr);
  };

  const lowlight = (extension.options as { lowlight: Lowlight }).lowlight;

  const selectLanguage = (next: string | null) => {
    updateAttributes({ language: normalizeCodeLanguage(next) });
    setOpen(false);
  };

  // The check icon shows for a moment after a copy.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyToClipboard = () => {
    void copyCode(node.textContent, { copied: t('code_copied'), failed: t('code_copy_failed') }).then(ok => {
      if (ok) setCopied(true);
    });
  };

  return (
    <NodeViewWrapper className="group/code relative">
      {editor.isEditable && (
        <div
          contentEditable={false}
          data-slot="code-block-toolbar"
          className={cn(
            'absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 transition-opacity',
            isActive || open ? 'opacity-100' : 'opacity-0 group-hover/code:opacity-100'
          )}
        >
          <ToolbarButton label={wrap ? t('code_wrap_off') : t('code_wrap_on')} pressed={wrap} onClick={toggleWrap}>
            <WrapText className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label={t('code_copy')} onClick={copyToClipboard}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </ToolbarButton>
          <FloatingCard open={open} onOpenChange={setOpen}>
            <FloatingCardTrigger>
              <button
                type="button"
                aria-label={t('code_language_label')}
                // Keep the editor selection: the click must not move the cursor out of the block.
                onMouseDown={e => e.preventDefault()}
                className="inline-flex h-6 items-center gap-0.5 rounded-md bg-code-fg/10 px-2 text-[11px] font-medium text-code-fg opacity-80 hover:bg-code-fg/15 hover:opacity-100"
              >
                {language ? codeLanguageLabel(language) : t('code_language_auto')}
                <ChevronDown className="size-3" />
              </button>
            </FloatingCardTrigger>
            <FloatingCardContent
              align="end"
              sideOffset={4}
              className="w-48 p-1"
              onInteractOutside={() => {
                closedByOutside.current = true;
              }}
              onCloseAutoFocus={e => {
                e.preventDefault();
                if (closedByOutside.current) {
                  closedByOutside.current = false;
                  return;
                }
                // A plain `focus()` scrolls to the old selection, which can be far from this
                // block (opened on hover), so the page jumped. Put the cursor at the end of
                // this block instead, and do not scroll: the block is already on screen.
                const pos = getPos();
                const target = isActive || typeof pos !== 'number' ? null : pos + node.nodeSize - 1;
                editor.commands.focus(target, { scrollIntoView: false });
              }}
            >
              <LanguageList languages={lowlight.listLanguages()} current={language} onSelect={selectLanguage} />
            </FloatingCardContent>
          </FloatingCard>
        </div>
      )}
      {/* spellCheck off: the browser marks code words as spelling errors (the red lines). */}
      <pre spellCheck={false}>
        <NodeViewContent<'code'> as="code" className={language ? `language-${language}` : undefined} />
      </pre>
    </NodeViewWrapper>
  );
}

type LanguageListProps = {
  languages: string[];
  current: string | null;
  onSelect: (language: string | null) => void;
};

function LanguageList({ languages, current, onSelect }: LanguageListProps) {
  const t = useTranslations('notes');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = searchCodeLanguages(languages, q);
  const showAuto = !q || t('code_language_auto').toLowerCase().includes(q);

  return (
    <div data-slot="code-language-list">
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (matches[0]) onSelect(matches[0]);
          else if (showAuto) onSelect(null);
        }}
        placeholder={t('code_language_search')}
        className="mb-1 h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
      />
      <div className="max-h-60 overflow-y-auto">
        {showAuto && (
          <LanguageOption label={t('code_language_auto')} active={current === null} onClick={() => onSelect(null)} />
        )}
        {matches.map(lang => (
          <LanguageOption
            key={lang}
            label={codeLanguageLabel(lang)}
            active={current === lang}
            onClick={() => onSelect(lang)}
          />
        ))}
        {!showAuto && matches.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('code_language_none')}</p>
        )}
      </div>
    </div>
  );
}

type ToolbarButtonProps = {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
};

/** Icon button of the code toolbar. It never takes the editor selection. */
function ToolbarButton({ label, onClick, pressed, children }: ToolbarButtonProps) {
  return (
    <HoverHint label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onMouseDown={e => e.preventDefault()}
        onClick={onClick}
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-md text-code-fg opacity-80 hover:bg-code-fg/15 hover:opacity-100',
          pressed ? 'bg-code-fg/15 opacity-100' : 'bg-code-fg/10'
        )}
      >
        {children}
      </button>
    </HoverHint>
  );
}

function LanguageOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
        active && 'font-medium text-foreground'
      )}
    >
      {label}
      {active && <Check className="size-3" />}
    </button>
  );
}
