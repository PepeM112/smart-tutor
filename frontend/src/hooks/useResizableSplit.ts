'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
      if (!isNaN(parsed) && parsed >= 0.2 && parsed <= 0.8) return parsed;
    }
  } catch {
    /* storage unavailable */
  }
  return defaultRatio;
}

/**
 * `dividerWidth` is the width in px of the divider between the panes. The ratio splits
 * the container width minus the divider, so the drag math removes it too.
 */
export function useResizableSplit(storageKey: string, defaultRatio: number, dividerWidth = 0) {
  const [splitRatio, setSplitRatio] = useState(() => loadSplitRatio(storageKey, defaultRatio));
  // Separate isDragging state (two flips: mousedown / mouseup) so consumers can
  // conditionally suppress spring animations while the divider is dragged.
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const latestRatio = useRef(splitRatio);

  useEffect(() => {
    latestRatio.current = splitRatio;
  }, [splitRatio]);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const resetRatio = useCallback(() => {
    setSplitRatio(defaultRatio);
    saveSplitRatio(storageKey, defaultRatio);
  }, [storageKey, defaultRatio]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // The divider center must stay under the cursor: main width = (W - divider) * ratio.
      const ratio = (e.clientX - rect.left - dividerWidth / 2) / (rect.width - dividerWidth);
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveSplitRatio(storageKey, latestRatio.current);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [storageKey, dividerWidth]);

  return { containerRef, splitRatio, setSplitRatio, handleDividerMouseDown, resetRatio, isDragging };
}
