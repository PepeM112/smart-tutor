import { useCallback, useEffect, useRef } from 'react';

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
 * The separator animates its width, for a separator that folds to 0 together with its panel.
 */
export const PANEL_ANIMATING_CLASS =
  '[&[data-animating]>[data-panel]]:transition-[flex-grow] [&[data-animating]>[data-panel]]:duration-200 [&[data-animating]>[data-panel]]:ease-[cubic-bezier(0.2,0,0,1)] [&[data-animating]>[data-separator]]:transition-[width] [&[data-animating]>[data-separator]]:duration-200 [&[data-animating]>[data-separator]]:ease-[cubic-bezier(0.2,0,0,1)]';

/** 0 with reduced motion: no animation, so no `data-animating` and no timer. */
export const readPanelDurationMs = (): number =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PANEL_DURATION_MS;

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
