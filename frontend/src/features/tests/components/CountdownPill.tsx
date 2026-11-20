'use client';

import { Timer, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { formatCountdown } from '../utils/countdown';

/** From this many seconds left, the pill warns. */
const LOW_TIME_SECONDS = 60;

interface CountdownPillProps {
  remainingSeconds: number;
}

/**
 * The time left, for the page header. Below a minute it warns with the failed color, an icon and words, so the
 * state never rests on color alone. The label folds away on a phone to leave room for Submit.
 */
export function CountdownPill({ remainingSeconds }: CountdownPillProps) {
  const t = useTranslations();
  const isLow = remainingSeconds <= LOW_TIME_SECONDS;
  const Icon = isLow ? TriangleAlert : Timer;

  return (
    <div
      role="timer"
      aria-label={t('exam.time_left')}
      data-testid="exam-countdown"
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium tabular-nums',
        isLow ? 'border-feedback-wrong-border bg-feedback-wrong-bg text-destructive' : 'border-border text-foreground'
      )}
    >
      <Icon className="size-4" />
      <span className="max-sm:sr-only">{isLow ? t('exam.under_minute') : t('exam.time_left')}</span>
      <span>{formatCountdown(remainingSeconds)}</span>
    </div>
  );
}
