'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode } from 'react';

import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO, useResizableSplit } from '@/hooks/useResizableSplit';
import { pageBleed } from '@/lib/pageBleed';
import { PANEL_FADE_DURATION, PANEL_SPRING } from '@/lib/panelMotion';
import { cn } from '@/lib/utils';

export type SplitPaneProps = {
  /** localStorage key for the saved ratio. Each split in the app uses its own key. */
  storageKey: string;
  defaultRatio?: number;
  /** Left pane. It scrolls by itself. */
  main: ReactNode;
  /** Right pane. `null` hides it and the divider, and the main pane uses the full width. */
  side: ReactNode | null;
  className?: string;
  /** Accessible name of the divider (screen readers only). */
  dividerLabel?: string;
  /** Classes for the main pane scroll box (padding, scrollbar style). */
  mainClassName?: string;
  /** Frame of the side content. Default: a card. The side pane clips its content; the content scrolls by itself. */
  sideClassName?: string;
  /**
   * For a full-height page: the scrollbar of the main pane is at the page edge, not inside the layout
   * padding (see `pageBleed`). The container keeps the same content box (negative margin + padding), so
   * the ratio and the side pane are where they were. Only the main pane grows into the padding, on the
   * right while there is no side pane, and at the bottom.
   */
  bleed?: boolean;
};

const SPRING = PANEL_SPRING;
const INSTANT = { duration: 0 };
/** Divider width in px (the grip is centered in it). */
const DIVIDER_WIDTH = 36;

/**
 * Seconds between the start of the pane motion and the start of the content fade.
 * Open: the pane starts to grow, then the content fades in after this delay.
 * Close: the content fades out at once, then the pane starts to shrink after this delay.
 * 0 = the fade and the pane motion start together.
 */
const CONTENT_FADE_DELAY = 0.15;
const CONTENT_FADE_DURATION = PANEL_FADE_DURATION;

/**
 * Two panes side by side with a draggable divider (double-click resets the ratio).
 * The divider takes pointer (mouse, touch, pen) and keyboard input: arrows move it, Home / End go to the limits.
 * Use it for every "list + detail panel on the right" page, so all of them get the same motion.
 *
 * Tiling grow: when `side` changes from null to a node, the side pane springs from
 * flex-grow 0 to (1 - splitRatio) and the main pane shrinks at the same time.
 * The side content fades in after CONTENT_FADE_DELAY. Close plays the reverse
 * (AnimatePresence keeps the last content rendered during the exit).
 *
 * No motion on the first render (`initial={false}`): a page that loads with the side
 * pane open shows it at once, in position. Only open/close after mount animate.
 * No motion while the divider is dragged (`isDragging`) or with reduced motion.
 *
 * `contain: size` stops the content height from growing the container: the panes
 * always fit the height that the parent gives, and each pane scrolls by itself.
 * The parent must give it a definite height (flex-1 in a bounded column, or a height class).
 */
export function SplitPane({
  storageKey,
  defaultRatio = 0.5,
  main,
  side,
  className,
  dividerLabel,
  mainClassName,
  sideClassName,
  bleed = false,
}: SplitPaneProps) {
  const { containerRef, splitRatio, handleDividerPointerDown, handleDividerKeyDown, resetRatio, isDragging } =
    useResizableSplit(storageKey, defaultRatio, DIVIDER_WIDTH);
  const prefersReduced = useReducedMotion();
  const instant = prefersReduced || isDragging;

  const openTransition = instant ? INSTANT : SPRING;
  // On close the panes wait for the content to start fading out first.
  const closeTransition = instant ? INSTANT : { ...SPRING, delay: CONTENT_FADE_DELAY };
  const fadeIn = instant ? INSTANT : { duration: CONTENT_FADE_DURATION, delay: CONTENT_FADE_DELAY };
  const fadeOut = instant ? INSTANT : { duration: CONTENT_FADE_DURATION };

  return (
    <div
      ref={containerRef}
      data-slot="split-pane"
      className={cn('flex min-h-0 flex-1 overflow-hidden [contain:size]', bleed && pageBleed.all, className)}
    >
      {/* Main pane — shrinks when the side pane opens. */}
      <motion.div
        className={cn(
          'min-w-0 overflow-y-auto',
          bleed && [pageBleed.marginBottom, pageBleed.paddingBottom],
          // With a side pane the main pane ends at the divider. The change eases with the pane motion.
          bleed && !side && [pageBleed.marginRight, pageBleed.paddingRight],
          bleed && 'transition-[margin,padding] duration-200 motion-reduce:transition-none',
          mainClassName
        )}
        style={{ flexShrink: 1, flexBasis: 0 }}
        initial={false}
        animate={{ flexGrow: side ? splitRatio : 1 }}
        transition={side ? openTransition : closeTransition}
      >
        {main}
      </motion.div>

      {/*
        The divider is its own flex item between the two panes. It has a fixed width, so the
        browser takes its width from the container first. Then the ratio splits the rest.
        If the divider were inside the side pane, the side pane would lose its width and the
        divider would not be at the true center. The divider and the side pane animate
        together with the same transition.
      */}
      <AnimatePresence initial={false}>
        {side && (
          <motion.div
            key="divider"
            data-slot="split-pane-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label={dividerLabel}
            // Value = share of the main pane, in percent.
            aria-valuenow={Math.round(splitRatio * 100)}
            aria-valuemin={MIN_SPLIT_RATIO * 100}
            aria-valuemax={MAX_SPLIT_RATIO * 100}
            tabIndex={0}
            // touch-none: a touch drag moves the divider, it does not scroll the page.
            className="group relative flex shrink-0 cursor-col-resize touch-none items-center justify-center overflow-hidden outline-none"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: DIVIDER_WIDTH, opacity: 1, transition: openTransition }}
            exit={{ width: 0, opacity: 0, transition: closeTransition }}
            onPointerDown={handleDividerPointerDown}
            onKeyDown={handleDividerKeyDown}
            onDoubleClick={resetRatio}
          >
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
            {/* Focus ring is on the grip: the divider box clips (overflow-hidden). */}
            <div className="relative z-10 h-7 w-3 rounded-full border border-border bg-background group-focus-visible:border-ring group-focus-visible:ring-2 group-focus-visible:ring-ring" />
          </motion.div>
        )}

        {side && (
          <motion.div
            key="side-pane"
            className="min-w-0"
            style={{ flexShrink: 1, flexBasis: 0, overflow: 'hidden' }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: 1 - splitRatio, transition: openTransition }}
            exit={{ flexGrow: 0, transition: closeTransition }}
          >
            {/* Side content — fades in after the pane starts to grow. */}
            <motion.div
              className={cn(
                'h-full min-w-0',
                sideClassName ?? 'overflow-hidden rounded-xl border border-border bg-card'
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: fadeIn }}
              exit={{ opacity: 0, transition: fadeOut }}
            >
              {side}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
