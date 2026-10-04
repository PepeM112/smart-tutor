'use client';

/**
 * Outline rail of a note (editable editor only).
 *
 * Collapsed: short dashes at the top right of the note scroll area, one per heading. The dash is longer
 * for a higher level (H1 > H2 > H3), and the active section is the dark one (scroll position).
 * Hover or keyboard focus opens a floating card with the headings, indented by level. The card slides in
 * from the right and fades, with the same motion as the side panel of `SplitPane`. A click scrolls to
 * the heading. Each heading has a "copy link" button (`/notes/{id}#slug`).
 *
 * The rail takes no layout space. It is a fixed layer in a portal, placed by `useRailPlacement` at a
 * fixed distance from the top and right edge of the note scroll area. So it does not move when the note
 * scrolls, or when the column changes between reading and full width. It is hidden below `lg`, with
 * fewer than 2 headings and when the text is too close to the right edge of the area.
 * Keyboard: the portal puts the rail at the end of the tab order. Esc closes the card.
 */

import { Link2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { HoverHint } from '@/components/ui/hover-hint';
import { PANEL_FADE_DURATION, PANEL_SPRING } from '@/lib/panelMotion';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { prefersReducedMotion, scrollToHeading } from './scroll';
import { useHeadingOutline } from './useHeadingOutline';
import { MIN_RAIL_SPACE, RAIL_WIDTH, useRailPlacement } from './useRailPlacement';
import { useScrollToHash } from './useScrollToHash';

import type { OutlineHeading } from './headings';
import type { Editor } from '@tiptap/core';

const MIN_HEADINGS = 2;
const CLOSE_DELAY_MS = 150;

/** Dash width by heading level (index = level - 1). */
const DASH_WIDTH = ['w-5', 'w-4', 'w-3'] as const;
/** The card starts this far (px) to the right and slides to its place. On close it goes half of it. */
const CARD_SLIDE_PX = 16;
const INSTANT = { duration: 0 };
/** Item indent by heading level (index = level - 1). */
const ITEM_INDENT = ['pl-2', 'pl-5', 'pl-8'] as const;

const levelClass = (classes: readonly string[], level: number): string =>
  classes[Math.min(Math.max(level, 1), classes.length) - 1];

export type NoteOutlineProps = {
  editor: Editor;
  /** The element the editor is rendered in. The free space for the rail is measured from it. */
  containerRef: RefObject<HTMLElement | null>;
  noteId: string;
};

export function NoteOutline({ editor, containerRef, noteId }: NoteOutlineProps) {
  const t = useTranslations('notes');
  const { headings, activeId } = useHeadingOutline(editor);
  const { space, layerRef } = useRailPlacement(editor, containerRef);
  const prefersReduced = useReducedMotion();
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

  const slide = prefersReduced ? 0 : CARD_SLIDE_PX;

  return createPortal(
    <div
      ref={layerRef}
      data-slot="note-outline-layer"
      // Position (top, right, max-height) is set by `useRailPlacement`.
      className="pointer-events-none fixed z-20 hidden flex-col lg:flex"
      style={{ width: RAIL_WIDTH }}
    >
      <nav
        data-slot="note-outline"
        aria-label={t('outline_label')}
        onPointerEnter={openRail}
        onPointerLeave={closeRailSoon}
        onFocus={openRail}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="pointer-events-auto relative flex min-h-0 flex-col"
      >
        {/* Collapsed: the dashes, right-aligned. The wide padding is the hit area. The dashes stay in
            place under the card, which hides them. */}
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-label={t('outline_label')}
          className="flex w-full flex-col items-end gap-3 overflow-hidden rounded-md py-4 pr-3 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {headings.map(heading => (
            <span
              key={heading.id}
              aria-hidden
              className={cn(
                'h-[3px] shrink-0 rounded-full transition-colors duration-150',
                levelClass(DASH_WIDTH, heading.level),
                heading.id === activeId ? 'bg-foreground' : 'bg-muted-foreground/50'
              )}
            />
          ))}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              key="card"
              data-slot="note-outline-card"
              // Right edge of the card on the right edge of the rail. It opens down from the top of the
              // rail, over the text, to the left.
              className="absolute top-0 right-0 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10"
              initial={{ opacity: 0, x: slide }}
              // Same feel as the `SplitPane` side panel: spring for the slide, short fade for the opacity.
              animate={{
                opacity: 1,
                x: 0,
                transition: prefersReduced ? INSTANT : { x: PANEL_SPRING, opacity: { duration: PANEL_FADE_DURATION } },
              }}
              // Out: a fade with a small slide. No spring, so it leaves at once.
              exit={{
                opacity: 0,
                x: slide / 2,
                transition: prefersReduced ? INSTANT : { duration: PANEL_FADE_DURATION },
              }}
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
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </div>,
    document.body
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
