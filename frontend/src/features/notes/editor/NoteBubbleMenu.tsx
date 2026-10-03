'use client';

/**
 * Bubble menu for the rich note editor.
 *
 * Appears on any non-empty text selection and offers:
 *   Color [A] · Bold · Italic · Strikethrough · Inline code · Link
 *   + optional "Ask AI" and "Send to Assistant" buttons (passed as callbacks).
 * Every button has a hover hint with its name (and shortcut, if any).
 *
 * The optional AI callbacks receive a `SelectionContext` with the selection's
 * markdown, plain text and a DOM rect — enough for the AI chunk-edit flow
 * and the assistant attachment flow to know what the user selected.
 */

import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, ChevronDown, Code, Italic, Link2, MessageSquareQuote, Strikethrough, WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { HoverHint } from '@/components/ui/hover-hint';
import { cn } from '@/lib/utils';

import { ColorSwatch } from './ColorSwatch';
import { selectionToMarkdown } from './markdown';
import { NOTE_PALETTE, type NoteColor } from './noteColor';

import type { Editor } from '@tiptap/core';

// ─── types ───────────────────────────────────────────────────────────────────

/** Data passed to the optional AI callbacks. */
export type SelectionContext = {
  /** The selected text serialized as GFM markdown. */
  markdown: string;
  /** The plain-text content of the selection (no formatting). */
  plainText: string;
  /** ProseMirror position where the selection starts. */
  from: number;
  /** ProseMirror position where the selection ends. */
  to: number;
  /** Bounding rect of the selection — for positioning AI popovers. */
  rect: DOMRect;
};

export type NoteBubbleMenuProps = {
  editor: Editor;
  /** Optional — renders "Ask AI" button when provided. */
  onAskAi?: (selection: SelectionContext) => void;
  /** Optional — renders "Send to Assistant" button when provided. */
  onSendToAssistant?: (selection: SelectionContext) => void;
};

type ColorAttrs = { color?: NoteColor | null; bg?: NoteColor | null };

// ─── component ───────────────────────────────────────────────────────────────

/* On touch devices the native selection toolbar (copy, paste…) shows above the selection,
so our menu goes below it. Constants: a new options object on each render would re-apply them. */
const TOP_OPTIONS = { placement: 'top' } as const;
const BOTTOM_OPTIONS = { placement: 'bottom' } as const;

export function NoteBubbleMenu({ editor, onAskAi, onSendToAssistant }: NoteBubbleMenuProps) {
  const t = useTranslations('notes');
  // Only one sub-panel at a time: the link input or the color palette.
  const [openPanel, setOpenPanel] = useState<'link' | 'color' | null>(null);
  const [linkHref, setLinkHref] = useState('');
  const mod = useModKey();
  const [isTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches);

  // A new selection closes any open sub-panel.
  useEffect(() => {
    const close = () => setOpenPanel(null);
    editor.on('selectionUpdate', close);
    return () => {
      editor.off('selectionUpdate', close);
    };
  }, [editor]);

  const handleLinkToggle = useCallback(() => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      setOpenPanel(null);
      return;
    }
    setLinkHref('');
    setOpenPanel(p => (p === 'link' ? null : 'link'));
  }, [editor]);

  const handleLinkConfirm = useCallback(() => {
    const href = linkHref.trim();
    if (href) {
      editor.chain().focus().setLink({ href }).run();
    }
    setOpenPanel(null);
    setLinkHref('');
  }, [editor, linkHref]);

  const handleAskAi = useCallback(() => {
    if (!onAskAi) return;
    const ctx = buildSelectionContext(editor);
    if (ctx) onAskAi(ctx);
  }, [editor, onAskAi]);

  const handleSendToAssistant = useCallback(() => {
    if (!onSendToAssistant) return;
    const ctx = buildSelectionContext(editor);
    if (ctx) onSendToAssistant(ctx);
  }, [editor, onSendToAssistant]);

  /* Tiptap 3 does not re-render on each transaction, so reading `editor.isActive()` during
  render goes stale when only the selection moves. `useEditorState` subscribes to the
  editor and re-renders only when one of these values changes. */
  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      strike: ed.isActive('strike'),
      code: ed.isActive('code'),
      link: ed.isActive('link'),
      color: (ed.getAttributes('noteColor') as ColorAttrs).color ?? null,
      bg: (ed.getAttributes('noteColor') as ColorAttrs).bg ?? null,
    }),
  });
  const colorAttrs: ColorAttrs = { color: active.color, bg: active.bg };

  return (
    <BubbleMenu
      editor={editor}
      options={isTouch ? BOTTOM_OPTIONS : TOP_OPTIONS}
      // Only show the bubble menu on non-empty text selections.
      shouldShow={({ state }) => {
        const { from, to } = state.selection;
        return from !== to;
      }}
    >
      <div
        data-slot="bubble-menu"
        className="relative flex items-center gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10"
      >
        {/* Color — first, as in Notion */}
        <HoverHint label={t('bubble_color')}>
          <button
            type="button"
            aria-label={t('bubble_color')}
            aria-expanded={openPanel === 'color'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setOpenPanel(p => (p === 'color' ? null : 'color'))}
            className={cn(
              'flex h-7 items-center gap-0.5 rounded-md px-1 transition-colors duration-75',
              openPanel === 'color'
                ? 'bg-muted text-foreground'
                : 'text-foreground/70 hover:bg-muted hover:text-foreground'
            )}
          >
            <ColorSwatch color={active.color} bg={active.bg} />
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </HoverHint>

        <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />

        {/* Inline formatting */}
        <BubbleMenuButton
          active={active.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label={t('bubble_bold')}
          shortcut={`${mod}B`}
          icon={<Bold className="size-3.5" />}
        />
        <BubbleMenuButton
          active={active.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label={t('bubble_italic')}
          shortcut={`${mod}I`}
          icon={<Italic className="size-3.5" />}
        />
        <BubbleMenuButton
          active={active.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label={t('bubble_strike')}
          shortcut={`${mod}⇧S`}
          icon={<Strikethrough className="size-3.5" />}
        />
        <BubbleMenuButton
          active={active.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
          label={t('bubble_code')}
          shortcut={`${mod}E`}
          icon={<Code className="size-3.5" />}
        />
        <BubbleMenuButton
          active={active.link || openPanel === 'link'}
          onClick={handleLinkToggle}
          label={active.link ? t('bubble_unlink') : t('bubble_link')}
          icon={<Link2 className="size-3.5" />}
        />

        {/* Divider before AI actions */}
        {(onAskAi ?? onSendToAssistant) && <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />}

        {onAskAi && (
          <BubbleMenuButton
            onClick={handleAskAi}
            label={t('bubble_ask_ai')}
            icon={<WandSparkles className="size-3.5" />}
          />
        )}
        {onSendToAssistant && (
          <BubbleMenuButton
            onClick={handleSendToAssistant}
            label={t('bubble_send_to_assistant')}
            icon={<MessageSquareQuote className="size-3.5" />}
          />
        )}

        {/* Sub-panels open below the menu, left-aligned */}
        {openPanel === 'link' && (
          <LinkPanel
            href={linkHref}
            onHrefChange={setLinkHref}
            onConfirm={handleLinkConfirm}
            onClose={() => setOpenPanel(null)}
            addLabel={t('bubble_link_add')}
          />
        )}

        {openPanel === 'color' && (
          <ColorPanel
            current={colorAttrs}
            onText={color => editor.chain().focus().setTextColor(color).run()}
            onBackground={bg => editor.chain().focus().setBackgroundColor(bg).run()}
          />
        )}
      </div>
    </BubbleMenu>
  );
}

// ─── selection ───────────────────────────────────────────────────────────────

/**
 * Build a `SelectionContext` from the current editor selection.
 * Returns `null` when the selection is empty.
 */
function buildSelectionContext(editor: Editor): SelectionContext | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;

  const markdown = selectionToMarkdown(editor);
  const plainText = editor.state.doc.textBetween(from, to, ' ');

  const domSelection = window.getSelection();
  const rect = domSelection?.rangeCount ? domSelection.getRangeAt(0).getBoundingClientRect() : new DOMRect();

  return { markdown, plainText, from, to, rect };
}

// ─── link panel ──────────────────────────────────────────────────────────────

type LinkPanelProps = {
  href: string;
  onHrefChange: (href: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  addLabel: string;
};

function LinkPanel({ href, onHrefChange, onConfirm, onClose, addLabel }: LinkPanelProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onConfirm();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="absolute left-0 top-full mt-1 flex items-center gap-1 rounded-lg bg-popover p-1.5 text-popover-foreground ring-1 ring-foreground/10">
      <input
        autoFocus
        type="url"
        value={href}
        onChange={e => onHrefChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="https://…"
        className="h-6 w-[min(12rem,calc(100vw-9rem))] rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
      />
      <Button size="sm" variant="default" className="h-6 px-2 text-xs" onClick={onConfirm}>
        {addLabel}
      </Button>
    </div>
  );
}

// ─── color palette ───────────────────────────────────────────────────────────

type ColorPanelProps = {
  current: ColorAttrs;
  onText: (color: NoteColor | null) => void;
  onBackground: (bg: NoteColor | null) => void;
};

function ColorPanel({ current, onText, onBackground }: ColorPanelProps) {
  const t = useTranslations('notes');
  const colorName = (c: NoteColor | null) => t(`color_${c ?? 'default'}`);

  const renderSection = (title: string, kind: 'text' | 'bg') => (
    <div>
      <div className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <div className="grid grid-cols-5 gap-1">
        {NOTE_PALETTE.map(c => {
          const selected = (kind === 'text' ? (current.color ?? null) : (current.bg ?? null)) === c;
          return (
            <HoverHint key={c ?? 'default'} label={colorName(c)}>
              <button
                type="button"
                aria-label={`${title}: ${colorName(c)}`}
                aria-pressed={selected}
                onMouseDown={e => e.preventDefault()}
                onClick={() => (kind === 'text' ? onText(c) : onBackground(c))}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md hover:bg-muted',
                  selected && 'ring-1 ring-primary'
                )}
              >
                {kind === 'text' ? <ColorSwatch color={c} bg={null} /> : <ColorSwatch color={null} bg={c} />}
              </button>
            </HoverHint>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      data-slot="bubble-color-panel"
      className="absolute left-0 top-full mt-1 flex flex-col gap-2 rounded-lg bg-popover p-2 text-popover-foreground ring-1 ring-foreground/10"
    >
      {renderSection(t('color_text'), 'text')}
      {renderSection(t('color_background'), 'bg')}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const isApplePlatform = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "⌘" on Apple platforms, "Ctrl+" elsewhere. The menu renders only after a client-side selection, so no SSR mismatch. */
function useModKey(): string {
  const [mod] = useState(() => (isApplePlatform() ? '⌘' : 'Ctrl+'));
  return mod;
}

type BubbleMenuButtonProps = {
  onClick: () => void;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  active?: boolean;
};

function BubbleMenuButton({ onClick, label, shortcut, icon, active = false }: BubbleMenuButtonProps) {
  return (
    <HoverHint label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        onMouseDown={e => e.preventDefault()}
        onClick={onClick}
        className={cn(
          'flex size-7 items-center justify-center rounded-md transition-colors duration-75',
          active ? 'bg-primary/10 text-primary' : 'text-foreground/70 hover:bg-muted hover:text-foreground'
        )}
      >
        {icon}
      </button>
    </HoverHint>
  );
}
