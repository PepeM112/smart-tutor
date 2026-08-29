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

export function useResizableSplit(storageKey: string, defaultRatio: number) {
  const [splitRatio, setSplitRatio] = useState(() => loadSplitRatio(storageKey, defaultRatio));
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const latestRatio = useRef(splitRatio);

  useEffect(() => {
    latestRatio.current = splitRatio;
  }, [splitRatio]);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const resetRatio = useCallback(() => {
    setSplitRatio(defaultRatio);
    saveSplitRatio(storageKey, defaultRatio);
  }, [storageKey, defaultRatio]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
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
  }, [storageKey]);

  return { containerRef, splitRatio, setSplitRatio, handleDividerMouseDown, resetRatio };
}
