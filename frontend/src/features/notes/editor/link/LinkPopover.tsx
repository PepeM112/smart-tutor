'use client';

/**
 * Popover of the link under the pointer or under the cursor (editable editor only).
 *
 *   [ https://example.com … ]  Open · Edit · Copy · Remove
 *
 * - Hover a link (about 250ms) or put the cursor in it: the popover shows below the link.
 * - Edit turns the URL into an input (Enter saves, Esc cancels). Cmd/Ctrl+K does the same from the keyboard.
 * - Esc closes the popover and keeps the cursor in the editor.
 * - Cmd/Ctrl+click on a link opens it (`noteLink.ts`).
 * - It shows only for a collapsed selection, so it never covers the bubble menu (that is for a text selection).
 *
 * Like `TableControls`, it is an overlay in the editor container. Nothing here is saved in the document.
 * At phone width the popover is at most the width of the editor and stays inside it (see `left`).
 */

import { Check, Copy, ExternalLink, Pencil, Unlink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';
import { toast } from 'sonner';

import { HoverHint } from '@/components/ui/hover-hint';

import { normalizeLinkHref, openLink } from './linkHref';
import { useLinkTarget, type LinkTarget } from './useLinkTarget';

import type { Editor } from '@tiptap/core';

const POPOVER_WIDTH = '20rem';
const POPOVER_GAP = 6; // px between the link and the popover

type LinkPopoverProps = {
  editor: Editor;
  /** The element the editor is rendered in. The overlay is positioned relative to it. */
  containerRef: RefObject<HTMLElement | null>;
};

export function LinkPopover({ editor, containerRef }: LinkPopoverProps) {
  const t = useTranslations('notes');
  const { target, hold, release, dismiss, pointerEnterPopover, pointerLeavePopover } = useLinkTarget(
    editor,
    containerRef
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(
    (current: LinkTarget) => {
      hold();
      setDraft(current.href);
      setEditing(true);
    },
    [hold]
  );

  const stopEdit = useCallback(
    (focusEditor: boolean) => {
      setEditing(false);
      release();
      if (focusEditor) editor.commands.focus(null, { scrollIntoView: false });
    },
    [editor, release]
  );

  // Cmd/Ctrl+K with the cursor in a link: edit its URL. Esc: close the popover.
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const dom = editor.view.dom;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const current = targetRef.current;
      if (!current) return;
      if (event.key === 'Escape') {
        dismiss();
        return;
      }
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      startEdit(current);
    };
    dom.addEventListener('keydown', onKeyDown);
    return () => dom.removeEventListener('keydown', onKeyDown);
  }, [editor, dismiss, startEdit]);

  // The input takes the focus when edit starts.
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!target) return null;

  const selectLink = () => editor.chain().setTextSelection({ from: target.from, to: target.to });

  const handleRemove = () => {
    selectLink().unsetLink().setTextSelection(target.to).run();
    setEditing(false);
    release();
    editor.commands.focus(null, { scrollIntoView: false });
  };

  const handleSave = () => {
    const href = normalizeLinkHref(draft);
    if (!href) {
      handleRemove();
      return;
    }
    if (href !== target.href) {
      // Collapse to the end of the link after the change, so the bubble menu does not open.
      selectLink().setLink({ href }).setTextSelection(target.to).run();
    }
    stopEdit(true);
  };

  const handleCopy = () => {
    navigator.clipboard
      .writeText(target.href)
      .then(() => toast.success(t('link_copied')))
      .catch(() => toast.error(t('link_copy_failed')));
  };

  // A click outside ends the edit and drops the draft. Focus that stays inside the popover (the save button) does not.
  const handleInputBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.closest('[data-slot="link-popover"]')?.contains(next)) return;
    stopEdit(false);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stopEdit(true);
    }
  };

  return (
    <div data-slot="link-popover-layer" className="pointer-events-none absolute inset-0 z-30" contentEditable={false}>
      <div
        data-slot="link-popover"
        role="group"
        aria-label={t('link_popover_label')}
        onPointerEnter={pointerEnterPopover}
        onPointerLeave={pointerLeavePopover}
        // Keep the editor selection while a button is pressed (the input still takes the focus).
        onMouseDown={event => {
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
        }}
        style={{
          top: target.bottom + POPOVER_GAP,
          // Left edge of the link, kept inside the editor: at 375px the popover is as wide as the editor.
          left: `max(0px, min(${target.left}px, calc(100% - ${POPOVER_WIDTH})))`,
          width: `min(${POPOVER_WIDTH}, 100%)`,
        }}
        className="pointer-events-auto absolute flex items-center gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10"
      >
        {editing ? (
          <>
            <input
              ref={inputRef}
              autoFocus
              type="url"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
              placeholder="https://…"
              aria-label={t('link_url_label')}
              className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <PopoverButton label={t('link_save')} onClick={handleSave}>
              <Check className="size-3.5" />
            </PopoverButton>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate px-2 text-xs text-muted-foreground" title={target.href}>
              {target.href}
            </span>
            <PopoverButton label={t('link_open')} onClick={() => openLink(target.href)}>
              <ExternalLink className="size-3.5" />
            </PopoverButton>
            <PopoverButton label={t('link_edit')} shortcut={`${modKey()}K`} onClick={() => startEdit(target)}>
              <Pencil className="size-3.5" />
            </PopoverButton>
            <PopoverButton label={t('link_copy')} onClick={handleCopy}>
              <Copy className="size-3.5" />
            </PopoverButton>
            <PopoverButton label={t('link_remove')} onClick={handleRemove}>
              <Unlink className="size-3.5" />
            </PopoverButton>
          </>
        )}
      </div>
    </div>
  );
}

const modKey = (): string =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';

type PopoverButtonProps = {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
};

function PopoverButton({ label, shortcut, onClick, children }: PopoverButtonProps) {
  return (
    <HoverHint label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/70 transition-colors duration-75 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        {children}
      </button>
    </HoverHint>
  );
}
