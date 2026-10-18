import { useCallback, useEffect, useRef } from 'react';

export type SentinelRef = (element: Element | null) => void;

/**
 * A ref for an element at the end of a note. `onReached` runs once, when the element scrolls into view.
 * Nothing is watched while `enabled` is false (for example, the note is done already).
 */
export function useEndSentinel(onReached: () => void, enabled: boolean): SentinelRef {
  const latest = useRef(onReached);
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    latest.current = onReached;
  });

  return useCallback<SentinelRef>(
    element => {
      // React calls the ref with null on unmount, and when `enabled` changes: stop the old watch first.
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!element || !enabled || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        latest.current();
      });
      observer.observe(element);
      observerRef.current = observer;
    },
    [enabled]
  );
}
