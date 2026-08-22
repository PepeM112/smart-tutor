'use client';

import { useEffect, useRef, useState } from 'react';

const CHAR_MS = 12;
const CATCH_UP_CHAR_MS = 4;
const LAG_THRESHOLD = 80;

export function useStreamingText(target: string, streaming: boolean): string {
  const [displayed, setDisplayed] = useState(target);
  const indexRef = useRef(target.length);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  useEffect(() => {
    if (!streaming) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      indexRef.current = target.length;
      return;
    }

    const tick = (now: number) => {
      const elapsed = now - lastTickRef.current;
      const lag = target.length - indexRef.current;
      const interval = lag > LAG_THRESHOLD ? CATCH_UP_CHAR_MS : CHAR_MS;

      if (elapsed >= interval) {
        const charsToAdd = Math.min(
          Math.max(1, Math.floor(elapsed / interval)),
          target.length - indexRef.current,
        );

        if (charsToAdd > 0) {
          indexRef.current += charsToAdd;
          setDisplayed(target.slice(0, indexRef.current));
        }
        lastTickRef.current = now;
      }

      if (indexRef.current < target.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (indexRef.current < target.length && rafRef.current === null) {
      lastTickRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, streaming]);

  if (!streaming) return target;

  return displayed;
}
