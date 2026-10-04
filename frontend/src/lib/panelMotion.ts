/** Motion values of side panels. `SplitPane` and the note outline card use them, so they feel the same. */

/** Spring feel ≈ 250ms, damping ratio ≈ 0.87 → barely perceptible overshoot. */
export const PANEL_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

/** Seconds the content fade takes. */
export const PANEL_FADE_DURATION = 0.15;
