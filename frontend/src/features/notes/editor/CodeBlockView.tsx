'use client';

// React NodeView for code blocks: the code plus a language chip in the top-right corner.
// The chip shows on hover and while the cursor is in the block (touch has no hover).
// Click → a filterable list of the registered lowlight languages. "Auto" = no language,
// so lowlight guesses the highlight. The language is stored as the ```lang fence.

import { NodeViewContent, NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { cn } from '@/lib/utils';

import type { createLowlight } from 'lowlight';

type Lowlight = ReturnType<typeof createLowlight>;

export function CodeBlockView({ node, editor, extension, getPos, updateAttributes }: NodeViewProps) {
  const t = useTranslations('notes');
  const [open, setOpen] = useState(false);
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

  const lowlight = (extension.options as { lowlight: Lowlight }).lowlight;

  const selectLanguage = (next: string | null) => {
    updateAttributes({ language: next });
    setOpen(false);
  };

  return (
    <NodeViewWrapper className="group/code relative">
      {editor.isEditable && (
        <div
          contentEditable={false}
          className={cn(
            'absolute top-1.5 right-1.5 z-10 transition-opacity',
            isActive || open ? 'opacity-100' : 'opacity-0 group-hover/code:opacity-100'
          )}
        >
          <FloatingCard open={open} onOpenChange={setOpen}>
            <FloatingCardTrigger>
              <button
                type="button"
                aria-label={t('code_language_label')}
                // Keep the editor selection: the click must not move the cursor out of the block.
                onMouseDown={e => e.preventDefault()}
                className="inline-flex h-6 items-center gap-0.5 rounded-md bg-code-fg/10 px-2 text-[11px] font-medium text-code-fg opacity-80 hover:bg-code-fg/15 hover:opacity-100"
              >
                {language ?? t('code_language_auto')}
                <ChevronDown className="size-3" />
              </button>
            </FloatingCardTrigger>
            <FloatingCardContent
              align="end"
              sideOffset={4}
              className="w-48 p-1"
              onCloseAutoFocus={e => {
                e.preventDefault();
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
  const matches = [...languages].sort().filter(lang => lang.includes(q));
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
          <LanguageOption key={lang} label={lang} active={current === lang} onClick={() => onSelect(lang)} />
        ))}
        {!showAuto && matches.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('code_language_none')}</p>
        )}
      </div>
    </div>
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
