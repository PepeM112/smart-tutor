import { useCallback, useEffect, useRef, useState } from 'react';

/** Motion values of side panels. `SplitPane` and the note outline card use them, so they feel the same. */

/** Spring feel ≈ 250ms, damping ratio ≈ 0.87 → barely perceptible overshoot. */
export const PANEL_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

/** Seconds the content fade takes. */
export const PANEL_FADE_DURATION = 0.15;

/**
 * Open / close motion of resizable panels (`SplitPane`, the Ask AI sheet). `react-resizable-panels` sets the
 * size of a panel as `flex-grow`. A panel animates only while its group has `data-animating`, so a drag
 * follows the pointer directly. Put `PANEL_ANIMATING_CLASS` on the `Group`, and call `animate(groupElement)`
 * right before the size change.
 */
export const PANEL_DURATION_MS = 200;

/**
 * Written in full, not built from parts: Tailwind finds a class only as a complete string in the source.
 * The separator animates its width, for a separator that folds to 0 together with its panel. Fades are not
 * here: the library puts a panel's `className` on an inner element, so a `[data-panel]` selector cannot reach it.
 */
export const PANEL_ANIMATING_CLASS =
  '[&[data-animating]>[data-panel]]:transition-[flex-grow] [&[data-animating]>[data-panel]]:duration-200 [&[data-animating]>[data-panel]]:ease-[cubic-bezier(0.2,0,0,1)] [&[data-animating]>[data-separator]]:transition-[width] [&[data-animating]>[data-separator]]:duration-200 [&[data-animating]>[data-separator]]:ease-[cubic-bezier(0.2,0,0,1)]';

/** Sidebar width: same duration and easing as the panels, no delay, none with reduced motion. */
export const PANEL_WIDTH_CLASS =
  'transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none';

/**
 * Simultaneous fade: the element fades while its width moves (sidebar labels and headings). The element stays
 * mounted, so the text never pops. Written in full strings so Tailwind finds the classes.
 */
export const fadeWithWidthClass = (visible: boolean): string =>
  visible
    ? 'opacity-100 transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none'
    : 'opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none';

/** Milliseconds the staged content fade takes. */
const PANEL_FADE_MS = PANEL_FADE_DURATION * 1000;
/** The content fades in this long after the width starts to grow, when the width is almost done. */
const PANEL_REVEAL_DELAY_MS = 150;
/** One frame of slack: the fold of the library starts one frame after the phase starts. */
const FRAME_MS = 16;

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 0 with reduced motion: no animation, so no `data-animating` and no timer. */
export const readPanelDurationMs = (): number => (prefersReducedMotion() ? 0 : PANEL_DURATION_MS);

/**
 * `animate(group)` sets `data-animating` on the group and removes it after the duration. It does nothing with
 * reduced motion. A second call restarts the timer. The timer stops when the component unmounts.
 */
export function usePanelAnimation(): { animate: (group: HTMLElement | null) => void } {
  const timer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const animate = useCallback((group: HTMLElement | null): void => {
    const duration = readPanelDurationMs();
    if (!group || duration === 0) return;
    group.setAttribute('data-animating', '');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => group.removeAttribute('data-animating'), duration);
  }, []);

  return { animate };
}

type StagedPhase = 'closed' | 'opening' | 'open' | 'fadingOut' | 'folding';

/**
 * What follows each timed phase, and after how many milliseconds. With reduced motion the delay is 0, except
 * for the fold: `null` means no timer, and `completeFold` ends the phase after the fold frame ran.
 */
const STAGED_NEXT: Partial<
  Record<StagedPhase, { phase: StagedPhase; delayMs: number; reducedDelayMs: number | null }>
> = {
  opening: { phase: 'open', delayMs: PANEL_REVEAL_DELAY_MS, reducedDelayMs: 0 },
  fadingOut: { phase: 'folding', delayMs: PANEL_FADE_MS, reducedDelayMs: 0 },
  folding: { phase: 'closed', delayMs: PANEL_DURATION_MS + FRAME_MS, reducedDelayMs: null },
};

const STAGED_CONTENT_CLASS =
  'h-full transition-opacity duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none';

export type StagedReveal = {
  /** Width side: true from the open until the fade-out ends. Drives the divider, the minimum size and the bleed. */
  isWidthOpen: boolean;
  /** True from the open until the fold ends. The side content stays rendered while it is true. */
  isMounted: boolean;
  /** True while the width folds: the caller resizes the panel to 0 then. */
  isFolding: boolean;
  /**
   * Call it after the fold resize ran. With reduced motion it ends the fold at once, so the content never
   * unmounts before the resize. With motion the fold timer ends it.
   */
  completeFold: () => void;
  /** Put it on the wrapper of the side content, not on the frame. */
  contentClassName: string;
};

/**
 * Staged fade of a side panel (`SplitPane`). Open: the width grows, then the content fades in.
 * Close: the content fades out, then the width folds, then the content unmounts.
 * The phase moves by timers, so the opacity always has a rendered start value to transition from.
 * With reduced motion the delays are 0 (see `STAGED_NEXT`; the fold waits for `completeFold`) and the classes carry no transition.
 */
export function useStagedReveal(open: boolean): StagedReveal {
  const [phase, setPhase] = useState<StagedPhase>(open ? 'open' : 'closed');
  const [wasOpen, setWasOpen] = useState(open);

  // Set state during render: React renders again at once, so no frame shows the old phase with the new `open`.
  if (open !== wasOpen) {
    setWasOpen(open);
    setPhase(open ? 'opening' : phase === 'closed' ? 'closed' : 'fadingOut');
  }

  useEffect(() => {
    const next = STAGED_NEXT[phase];
    if (!next) return;
    const delayMs = prefersReducedMotion() ? next.reducedDelayMs : next.delayMs;
    if (delayMs === null) return;
    const timer = window.setTimeout(() => setPhase(next.phase), delayMs);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const completeFold = useCallback((): void => {
    if (prefersReducedMotion()) setPhase(current => (current === 'folding' ? 'closed' : current));
  }, []);

  const isContentVisible = phase === 'open';
  return {
    isWidthOpen: phase === 'opening' || phase === 'open' || phase === 'fadingOut',
    isMounted: phase !== 'closed',
    isFolding: phase === 'folding',
    completeFold,
    contentClassName: `${STAGED_CONTENT_CLASS} ${isContentVisible ? 'opacity-100' : 'opacity-0'}`,
  };
}
