'use client';

/**
 * Outline rail of a note (editable editor only).
 *
 * Collapsed: short dashes to the right of the note column, one per heading. The dash is longer for a
 * higher level (H1 > H2 > H3) and the active section is highlighted by the scroll position.
 * Hover or keyboard focus opens a floating card with the headings, indented by level. A click scrolls
 * to the heading. Each heading has a "copy link" button (`/notes/{id}#slug`).
 *
 * Like `TableControls`, it is an overlay in the editor container and takes no layout space. The wrapper
 * is as high as the column, and the rail is `sticky` in it, so it stays near the top while the note scrolls.
 * It is hidden below `lg`, with fewer than 2 headings and when the space right of the column is too small
 * (full width mode on a narrow window, or the diff panel is open).
 */

import { Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';
import { toast } from 'sonner';

import { HoverHint } from '@/components/ui/hover-hint';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { prefersReducedMotion, scrollToHeading } from './scroll';
import { useHeadingOutline } from './useHeadingOutline';
import { useRailSpace } from './useRailSpace';
import { useScrollToHash } from './useScrollToHash';

import type { OutlineHeading } from './headings';
import type { Editor } from '@tiptap/core';

/** Least free space (px) right of the column for the rail (gap + dashes) to fit without overlap. */
export const MIN_RAIL_SPACE = 40;
const MIN_HEADINGS = 2;
const CLOSE_DELAY_MS = 150;

/** Dash width by heading level (index = level - 1). */
const DASH_WIDTH = ['w-4', 'w-3', 'w-2'] as const;
/** Item indent by heading level (index = level - 1). */
const ITEM_INDENT = ['pl-2', 'pl-5', 'pl-8'] as const;

const levelClass = (classes: readonly string[], level: number): string =>
  classes[Math.min(Math.max(level, 1), classes.length) - 1];

export type NoteOutlineProps = {
  editor: Editor;
  /** The element the editor is rendered in. The rail is positioned relative to it. */
  containerRef: RefObject<HTMLElement | null>;
  noteId: string;
};

export function NoteOutline({ editor, containerRef, noteId }: NoteOutlineProps) {
  const t = useTranslations('notes');
  const { headings, activeId } = useHeadingOutline(editor);
  const space = useRailSpace(editor, containerRef);
  useScrollToHash(editor);

  const [open, setOpen] = useState(false);
  const closeTimer = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const openRail = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  }, []);
  // A short delay, so the pointer can cross the gap between the dashes and the card.
  const closeRailSoon = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Center the active item in the card when it opens (not on every scroll of the note).
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!open || !list || !item) return;
    list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
  }, [open]);

  const goTo = (heading: OutlineHeading) => {
    scrollToHeading(editor.view.dom, heading.id, prefersReducedMotion() ? 'auto' : 'smooth');
  };

  const copyLink = (heading: OutlineHeading) => {
    const url = `${window.location.origin}${Routes.NOTE_DETAIL(noteId)}#${encodeURIComponent(heading.id)}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t('outline_link_copied')))
      .catch(() => toast.error(t('outline_link_copy_failed')));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Close when the focus leaves the whole rail (not when it moves between its buttons).
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  if (headings.length < MIN_HEADINGS || space < MIN_RAIL_SPACE) return null;

  return (
    <div
      data-slot="note-outline-layer"
      className="pointer-events-none absolute top-0 bottom-0 left-full z-20 hidden w-0 lg:block"
      contentEditable={false}
    >
      <nav
        data-slot="note-outline"
        aria-label={t('outline_label')}
        onPointerEnter={openRail}
        onPointerLeave={closeRailSoon}
        onFocus={openRail}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="pointer-events-auto sticky top-24 ml-2 w-7"
      >
        {/* Collapsed: the dashes. They stay in place under the card, which hides them. */}
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-label={t('outline_label')}
          className="flex max-h-[calc(100dvh-14rem)] w-full flex-col items-start gap-2 overflow-hidden rounded-md py-1 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {headings.map(heading => (
            <span
              key={heading.id}
              aria-hidden
              className={cn(
                'h-0.5 shrink-0 rounded-full transition-colors duration-150',
                levelClass(DASH_WIDTH, heading.level),
                heading.id === activeId ? 'bg-foreground' : 'bg-muted-foreground/40'
              )}
            />
          ))}
        </button>

        {open && (
          <div
            data-slot="note-outline-card"
            // Right edge of the card on the right edge of the rail: it opens over the text, to the left.
            className="absolute top-0 right-0 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10"
          >
            <ul ref={listRef} className="relative max-h-[min(24rem,60dvh)] overflow-y-auto">
              {headings.map(heading => (
                <OutlineItem
                  key={heading.id}
                  heading={heading}
                  isActive={heading.id === activeId}
                  copyLabel={t('outline_copy_link')}
                  onGo={() => goTo(heading)}
                  onCopy={() => copyLink(heading)}
                />
              ))}
            </ul>
          </div>
        )}
      </nav>
    </div>
  );
}

type OutlineItemProps = {
  heading: OutlineHeading;
  isActive: boolean;
  copyLabel: string;
  onGo: () => void;
  onCopy: () => void;
};

function OutlineItem({ heading, isActive, copyLabel, onGo, onCopy }: OutlineItemProps) {
  return (
    <li
      aria-current={isActive ? 'location' : undefined}
      className={cn(
        'group/item flex items-center rounded-md transition-colors duration-75 focus-within:bg-muted hover:bg-muted',
        isActive && 'bg-muted/60'
      )}
    >
      <button
        type="button"
        onClick={onGo}
        className={cn(
          'min-w-0 flex-1 truncate py-1.5 pr-1 text-left text-xs focus-visible:outline-2 focus-visible:outline-primary',
          levelClass(ITEM_INDENT, heading.level),
          isActive ? 'font-medium text-foreground' : 'text-muted-foreground group-hover/item:text-foreground'
        )}
      >
        {heading.text}
      </button>
      <HoverHint label={copyLabel} side="bottom">
        <button
          type="button"
          aria-label={copyLabel}
          onClick={onCopy}
          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Link2 className="size-3.5" />
        </button>
      </HoverHint>
    </li>
  );
}
