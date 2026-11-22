'use client';

import { useEffect, useRef, useState } from 'react';

import { clockNow, secondsLeft } from '../utils/countdown';

/** The longest delay that `setTimeout` accepts (about 24.8 days). A longer delay would fire at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** How often the display refreshes. */
const DISPLAY_INTERVAL_MS = 500;

/**
 * Whole seconds left until `deadlineAt`, or null without a deadline. It calls `onTimeout` once, when the time
 * is over. The timer is a hook, not a component: the header renders the pill twice (desktop and phone), and
 * only one timer may run.
 */
export function useCountdown(deadlineAt: Date | null | undefined, onTimeout: () => void): number | null {
  const [remaining, setRemaining] = useState<number | null>(() =>
    deadlineAt ? secondsLeft(deadlineAt, clockNow()) : null
  );
  const timeoutRef = useRef(onTimeout);
  const hasFired = useRef(false);

  useEffect(() => {
    timeoutRef.current = onTimeout;
  });

  useEffect(() => {
    if (!deadlineAt) return;

    const fire = () => {
      if (hasFired.current) return;
      hasFired.current = true;
      timeoutRef.current();
    };
    const tick = () => {
      const left = secondsLeft(deadlineAt, clockNow());
      setRemaining(left);
      if (left === 0) fire();
    };

    tick();
    // The submit has its own single timeout. A chained interval can run only once per minute in a
    // hidden tab (browser throttling), which would be after the grace time of the server.
    const submitTimer = window.setTimeout(
      () => {
        setRemaining(0);
        fire();
      },
      Math.min(Math.max(0, deadlineAt.getTime() - clockNow()), MAX_TIMEOUT_MS)
    );
    // The interval is only for the display.
    const displayTimer = window.setInterval(tick, DISPLAY_INTERVAL_MS);
    // A tab that comes back to the front must not wait for the next interval.
    document.addEventListener('visibilitychange', tick);

    return () => {
      window.clearTimeout(submitTimer);
      window.clearInterval(displayTimer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [deadlineAt]);

  // Derived, not reset in the effect: a removed deadline must show null at once.
  return deadlineAt ? remaining : null;
}
