'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode } from 'react';

import { useResizableSplit } from '@/hooks/useResizableSplit';
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
  /** Classes for the main pane scroll box (padding, scrollbar style). */
  mainClassName?: string;
  /** Frame of the side content. Default: a card. The side pane clips its content; the content scrolls by itself. */
  sideClassName?: string;
};

// Spring feel ≈ 250ms, damping ratio ≈ 0.87 → barely perceptible overshoot.
const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };
const INSTANT = { duration: 0 };

/**
 * Seconds between the start of the pane motion and the start of the content fade.
 * Open: the pane starts to grow, then the content fades in after this delay.
 * Close: the content fades out at once, then the pane starts to shrink after this delay.
 * 0 = the fade and the pane motion start together.
 */
const CONTENT_FADE_DELAY = 0.15;
/** Seconds the content fade takes. */
const CONTENT_FADE_DURATION = 0.15;

/**
 * Two panes side by side with a draggable divider (double-click resets the ratio).
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
  mainClassName,
  sideClassName,
}: SplitPaneProps) {
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio, isDragging } = useResizableSplit(
    storageKey,
    defaultRatio
  );
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
      className={cn('flex min-h-0 flex-1 overflow-hidden [contain:size]', className)}
    >
      {/* Main pane — shrinks when the side pane opens. */}
      <motion.div
        className={cn('min-w-0 overflow-y-auto', mainClassName)}
        style={{ flexShrink: 1, flexBasis: 0 }}
        initial={false}
        animate={{ flexGrow: side ? splitRatio : 1 }}
        transition={side ? openTransition : closeTransition}
      >
        {main}
      </motion.div>

      {/* Side pane + divider animate in/out as one flex unit. */}
      <AnimatePresence initial={false}>
        {side && (
          <motion.div
            key="side-pane"
            className="flex min-w-0"
            style={{ flexShrink: 1, flexBasis: 0, overflow: 'hidden' }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: 1 - splitRatio, transition: openTransition }}
            exit={{ flexGrow: 0, transition: closeTransition }}
          >
            {/* Divider */}
            <div
              role="separator"
              aria-orientation="vertical"
              className="relative mx-2 flex w-5 shrink-0 cursor-col-resize items-center justify-center"
              onMouseDown={handleDividerMouseDown}
              onDoubleClick={resetRatio}
            >
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
              <div className="relative z-10 h-7 w-3 rounded-full border border-border bg-background" />
            </div>

            {/* Side content — fades in after the pane starts to grow. */}
            <motion.div
              className={cn(
                'min-w-0 flex-1',
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
