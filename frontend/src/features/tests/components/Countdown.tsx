'use client';

import { Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { clockNow, formatCountdown, secondsLeft } from '../utils/countdown';

/** The longest delay that `setTimeout` accepts (about 24.8 days). A longer delay would fire at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** How often the display refreshes. */
const DISPLAY_INTERVAL_MS = 500;

type Props = {
  deadlineAt: Date;
  /** Runs once, when the time is over. */
  onTimeout: () => void;
};

/** A sticky countdown. It calls `onTimeout` once, when the time is over. */
export function Countdown({ deadlineAt, onTimeout }: Props) {
  const t = useTranslations();
  const [remaining, setRemaining] = useState(() => secondsLeft(deadlineAt, clockNow()));
  const timeoutRef = useRef(onTimeout);
  const hasFired = useRef(false);

  useEffect(() => {
    timeoutRef.current = onTimeout;
  });

  useEffect(() => {
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

  const isLow = remaining <= 60;

  return (
    <div
      role="timer"
      aria-label={t('exam.time_left')}
      data-testid="exam-countdown"
      className={cn(
        'sticky top-0 z-10 flex items-center justify-end gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium tabular-nums shadow-card',
        isLow ? 'text-destructive' : 'text-foreground'
      )}
    >
      <Timer className="size-4" />
      <span>{t('exam.time_left')}</span>
      <span>{formatCountdown(remaining)}</span>
    </div>
  );
}
