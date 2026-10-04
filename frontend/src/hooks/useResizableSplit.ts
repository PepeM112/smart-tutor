'use client';

import { useCallback, useRef, useState } from 'react';

import { usePointerDrag } from './usePointerDrag';

export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;
/** Ratio change for one arrow key press. */
const KEY_STEP = 0.02;

const clampRatio = (ratio: number): number => Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));

function saveSplitRatio(storageKey: string, ratio: number): void {
  try {
    localStorage.setItem(storageKey, ratio.toString());
  } catch {
    /* storage unavailable */
  }
}

function loadSplitRatio(storageKey: string, defaultRatio: number): number {
  if (typeof window === 'undefined') return defaultRatio;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= MIN_SPLIT_RATIO && parsed <= MAX_SPLIT_RATIO) return parsed;
    }
  } catch {
    /* storage unavailable */
  }
  return defaultRatio;
}

/**
 * `dividerWidth` is the width in px of the divider between the panes. The ratio splits
 * the container width minus the divider, so the drag math removes it too.
 * The ratio is saved when a drag ends and after each key press or reset.
 */
export function useResizableSplit(storageKey: string, defaultRatio: number, dividerWidth = 0) {
  const [splitRatio, setSplitRatio] = useState(() => loadSplitRatio(storageKey, defaultRatio));
  const containerRef = useRef<HTMLDivElement>(null);
  // Written where the ratio changes (not in an effect), so a release in the same frame saves the last value.
  const latestRatio = useRef(splitRatio);

  const updateRatio = useCallback((ratio: number): void => {
    latestRatio.current = ratio;
    setSplitRatio(ratio);
  }, []);

  const handleMove = useCallback(
    (e: PointerEvent): void => {
      if (!containerRef.current) return;
      // Content box of the container: its padding is not part of the split (a `bleed` split has some).
      const container = containerRef.current;
      const style = getComputedStyle(container);
      const left = container.getBoundingClientRect().left + container.clientLeft + parseFloat(style.paddingLeft);
      const width = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      // The divider center must stay under the cursor: main width = (W - divider) * ratio.
      const ratio = (e.clientX - left - dividerWidth / 2) / (width - dividerWidth);
      updateRatio(clampRatio(ratio));
    },
    [dividerWidth, updateRatio]
  );

  const handleEnd = useCallback((): void => saveSplitRatio(storageKey, latestRatio.current), [storageKey]);

  // `isDragging` lets consumers suppress spring animations while the divider is dragged.
  const { startDrag: handleDividerPointerDown, isDragging } = usePointerDrag({
    onMove: handleMove,
    onEnd: handleEnd,
    cursor: 'col-resize',
  });

  const setAndSaveRatio = useCallback(
    (ratio: number): void => {
      updateRatio(ratio);
      saveSplitRatio(storageKey, ratio);
    },
    [storageKey, updateRatio]
  );

  const resetRatio = useCallback((): void => setAndSaveRatio(defaultRatio), [defaultRatio, setAndSaveRatio]);

  // Arrow keys move the divider, Home / End go to the limits (the keyboard way to resize).
  const handleDividerKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      const target: number | null =
        e.key === 'ArrowLeft'
          ? latestRatio.current - KEY_STEP
          : e.key === 'ArrowRight'
            ? latestRatio.current + KEY_STEP
            : e.key === 'Home'
              ? MIN_SPLIT_RATIO
              : e.key === 'End'
                ? MAX_SPLIT_RATIO
                : null;
      if (target === null) return;
      e.preventDefault();
      setAndSaveRatio(clampRatio(target));
    },
    [setAndSaveRatio]
  );

  return { containerRef, splitRatio, handleDividerPointerDown, handleDividerKeyDown, resetRatio, isDragging };
}
