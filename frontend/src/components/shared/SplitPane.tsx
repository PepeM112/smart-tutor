'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator, useGroupRef, usePanelRef } from 'react-resizable-panels';

import { pageBleed } from '@/lib/pageBleed';
import { PANEL_ANIMATING_CLASS, usePanelAnimation, useStagedReveal } from '@/lib/panelMotion';
import { cn } from '@/lib/utils';

export type SplitPaneProps = {
  /** localStorage key for the saved ratio. Each split in the app uses its own key. */
  storageKey: string;
  /** An old key that this split used to share with another split. Read once as the start value, never written. */
  legacyStorageKey?: string;
  defaultRatio?: number;
  /** Left pane. It scrolls by itself. */
  main: ReactNode;
  /** Right pane. `null` hides it and the divider, and the main pane uses the full width. */
  side: ReactNode | null;
  className?: string;
  /** Accessible name of the divider (screen readers only). Default: `common.resize_panel`. */
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

const MAIN_ID = 'main';
const SIDE_ID = 'side';
/** Limits of the side pane, as a share of the two panes. The main pane gets the rest. */
const MIN_SPLIT_RATIO = 0.2;
const MAX_SPLIT_RATIO = 0.8;
const toPercent = (ratio: number): string => `${ratio * 100}%`;

/**
 * Two panes side by side with a draggable divider, built on `react-resizable-panels` (double-click resets the ratio).
 * The library gives the divider pointer (mouse, touch, pen) and keyboard input (arrows, Home / End) and its ARIA values.
 * Use it for every "list + detail panel on the right" page, so all of them get the same motion.
 *
 * Open and close: the side panel and its divider stay in the tree. `side` going from null to a node grows
 * the panel from 0 to the saved ratio, then the content fades in. null fades the content out, then folds the
 * panel back to 0 (see `useStagedReveal`). The content stays rendered until the fold ends. No motion on the
 * first render, and none with reduced motion.
 *
 * The ratio is the share of the main pane (0..1). It is saved in `storageKey` after a drag, a key press or a reset.
 *
 * `contain: size` stops the content height from growing the container: the panes
 * always fit the height that the parent gives, and each pane scrolls by itself.
 * The parent must give it a definite height (flex-1 in a bounded column, or a height class).
 */
export function SplitPane({
  storageKey,
  legacyStorageKey,
  defaultRatio = 0.5,
  main,
  side,
  className,
  dividerLabel,
  mainClassName,
  sideClassName,
  bleed = false,
}: SplitPaneProps) {
  const t = useTranslations('common');
  const hasSide = Boolean(side);
  const groupRef = useGroupRef();
  const sidePanelRef = usePanelRef();
  const groupElementRef = useRef<HTMLDivElement>(null);
  const { animate } = usePanelAnimation();

  // The library reads `defaultSize` only when a panel registers, and both panels stay registered. Values
  // from the first render are enough, and a later change of them would make the library lay out again.
  const [initial] = useState(() => ({
    hasSide,
    ratio: loadSplitRatio(storageKey, defaultRatio, legacyStorageKey),
  }));
  const ratio = useRef(initial.ratio);

  // The side content stays rendered while the panel folds. Set state during render: React renders again at once.
  const [retainedSide, setRetainedSide] = useState<ReactNode>(side);
  if (side && side !== retainedSide) setRetainedSide(side);
  const shownSide = side || retainedSide;

  const { isWidthOpen, isMounted, isFolding, completeFold, contentClassName } = useStagedReveal(hasSide);
  // Release the node once the fold ended, so a closed pane holds no stale content.
  if (!side && !isMounted && retainedSide) setRetainedSide(null);

  const wasWidthOpen = useRef(hasSide);
  useEffect(() => {
    if (wasWidthOpen.current === isWidthOpen) return;
    wasWidthOpen.current = isWidthOpen;
    if (!isWidthOpen) return;
    animate(groupElementRef.current);
    groupRef.current?.setLayout({ [MAIN_ID]: ratio.current * 100, [SIDE_ID]: (1 - ratio.current) * 100 });
  }, [isWidthOpen, animate, groupRef]);

  // Fold: the side panel loses its minimum in the render where `isWidthOpen` turns false. The library applies
  // a new minimum after the effects of that render, so the fold waits one frame. A fold in the same
  // pass would stop at the old minimum.
  useEffect(() => {
    if (!isFolding) return;
    const foldFrame = window.requestAnimationFrame(() => {
      animate(groupElementRef.current);
      sidePanelRef.current?.resize(0);
      completeFold();
    });
    return () => window.cancelAnimationFrame(foldFrame);
  }, [isFolding, animate, sidePanelRef, completeFold]);

  const saveRatio = (next: number): void => {
    ratio.current = next;
    saveSplitRatio(storageKey, next);
  };

  // Only user resizes are saved: opening, closing and a window resize also change the layout.
  const handleLayoutChanged = (layout: Record<string, number>, meta: { isUserInteraction: boolean }): void => {
    const main = layout[MAIN_ID] ?? 0;
    const sideSize = layout[SIDE_ID] ?? 0;
    if (!meta.isUserInteraction || sideSize === 0) return;
    saveRatio(main / (main + sideSize));
  };

  // The library's own double-click resets to the size at mount, not to `defaultRatio`, so it is off.
  const resetRatio = (): void => {
    groupRef.current?.setLayout({ [MAIN_ID]: defaultRatio * 100, [SIDE_ID]: (1 - defaultRatio) * 100 });
    saveRatio(defaultRatio);
  };

  return (
    <div
      data-slot="split-pane"
      className={cn('flex min-h-0 flex-1 overflow-hidden [contain:size]', bleed && pageBleed.all, className)}
    >
      {/*
        The group keeps `overflow: visible` so a `bleed` main pane can grow into the padding of the container above.
        The container clips it. `height` and `width` are auto: the group is a flex item of the container.
      */}
      <Group
        elementRef={groupElementRef}
        groupRef={groupRef}
        orientation="horizontal"
        onLayoutChanged={handleLayoutChanged}
        className={cn('min-h-0 min-w-0 flex-1', PANEL_ANIMATING_CLASS)}
        style={{ width: 'auto', height: 'auto', overflow: 'visible' }}
      >
        <Panel
          id={MAIN_ID}
          defaultSize={initial.hasSide ? toPercent(initial.ratio) : '100%'}
          className={cn(
            'min-w-0 overflow-y-auto',
            bleed && [pageBleed.marginBottom, pageBleed.paddingBottom],
            // With a side pane the main pane ends at the divider. The change eases with the pane motion.
            bleed && !isWidthOpen && [pageBleed.marginRight, pageBleed.paddingRight],
            bleed && 'transition-[margin,padding] duration-200 motion-reduce:transition-none',
            mainClassName
          )}
          // The library limits the pane to the box of its parent. A bleed pane is larger on purpose.
          style={bleed ? { maxWidth: 'none', maxHeight: 'none' } : undefined}
        >
          {main}
        </Panel>

        {/*
          The divider is its own flex item between the two panes, with a fixed width, so the browser takes
          its width first and the ratio splits the rest. It folds to 0 width (and out of the tab order) while
          there is no side pane. It stays in the tree so the width can animate.
        */}
        <Separator
          data-slot="split-pane-divider"
          aria-label={dividerLabel ?? t('resize_panel')}
          aria-hidden={!isWidthOpen}
          inert={!isWidthOpen}
          disabled={!isWidthOpen}
          disableDoubleClick
          onDoubleClick={resetRatio}
          className={cn(
            'group relative flex shrink-0 cursor-col-resize items-center justify-center overflow-hidden outline-none',
            isWidthOpen ? 'w-9' : 'w-0'
          )}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
          {/* Focus ring is on the grip: the divider box clips (overflow-hidden). */}
          <div className="relative z-10 h-7 w-3 rounded-full border border-border bg-background group-focus-visible:border-ring group-focus-visible:ring-2 group-focus-visible:ring-ring" />
        </Separator>

        <Panel
          id={SIDE_ID}
          panelRef={sidePanelRef}
          defaultSize={initial.hasSide ? toPercent(1 - initial.ratio) : '0%'}
          // The minimum is 0 while there is no side pane, so it can fold. It is not `collapsible`: the
          // library folds a collapsible pane when a drag goes past its minimum, and the user must stop there.
          minSize={isWidthOpen ? toPercent(MIN_SPLIT_RATIO) : 0}
          maxSize={toPercent(MAX_SPLIT_RATIO)}
          className={cn('min-w-0', isMounted && (sideClassName ?? 'rounded-xl border border-border bg-card'))}
          // The default frame is a card that clips its content. A custom frame scrolls by itself.
          style={sideClassName ? undefined : { overflow: 'hidden' }}
        >
          {/* The fade is on this wrapper: the library puts the panel `className` on an inner element. */}
          {isMounted && <div className={contentClassName}>{shownSide}</div>}
        </Panel>
      </Group>
    </div>
  );
}

const clampRatio = (ratio: number): number => Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));

function saveSplitRatio(storageKey: string, ratio: number): void {
  try {
    localStorage.setItem(storageKey, clampRatio(ratio).toString());
  } catch {
    /* storage unavailable */
  }
}

function readSplitRatio(storageKey: string): number | null {
  try {
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? parseFloat(stored) : NaN;
    return !isNaN(parsed) && parsed >= MIN_SPLIT_RATIO && parsed <= MAX_SPLIT_RATIO ? parsed : null;
  } catch {
    return null; // storage unavailable
  }
}

function loadSplitRatio(storageKey: string, defaultRatio: number, legacyStorageKey?: string): number {
  if (typeof window === 'undefined') return defaultRatio;
  return readSplitRatio(storageKey) ?? (legacyStorageKey ? readSplitRatio(legacyStorageKey) : null) ?? defaultRatio;
}
