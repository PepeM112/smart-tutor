'use client';

import { Check, CircleCheck, Play, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SpaceDetail, type SpaceItemRead, type SpaceProgress } from '@/client';
import { Button } from '@/components/ui/button';
import { courseAttemptHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useCourseProgress } from '../hooks/useCourseProgress';
import { attemptAction, canTrackProgress } from '../lib/progress';

/** The circle before an item: filled with a check when the item is done. */
export function ItemProgressCircle({ done }: { done: boolean }) {
  const t = useTranslations();
  return (
    <span
      role="img"
      aria-label={t(done ? 'courses.item_done' : 'courses.item_not_done')}
      data-testid="item-progress"
      data-done={done}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border',
        done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

/** A thin bar with the course percent. */
export function CourseProgressBar({ progress, className }: { progress: SpaceProgress; className?: string }) {
  const t = useTranslations();
  return (
    <div className={cn('flex flex-col gap-1', className)} data-testid="course-progress">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {t('courses.progress_percent', { percent: progress.percent })}
        </span>
        <span>{t('courses.progress_items', { done: progress.completedItems, total: progress.totalItems })}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}

/** "Mark complete" / "Mark as not done" for a NOTE item. Viewers only, and not in an archived course. */
export function NoteDoneButton({
  course,
  item,
  onUnmark,
}: {
  course: SpaceDetail;
  item: SpaceItemRead;
  /** Runs when the student takes the mark away. */
  onUnmark?: () => void;
}) {
  const t = useTranslations();
  const { markDone, unmarkDone } = useCourseProgress(course.id);

  if (!canTrackProgress(course)) return null;

  return item.completed ? (
    <Button
      variant="outline"
      size="sm"
      icon={CircleCheck}
      loading={unmarkDone.isPending}
      onClick={() => {
        onUnmark?.();
        unmarkDone.mutate(item.id);
      }}
    >
      {t('courses.unmark_complete')}
    </Button>
  ) : (
    <Button size="sm" icon={Check} loading={markDone.isPending} onClick={() => markDone.mutate(item.id)}>
      {t('courses.mark_complete')}
    </Button>
  );
}

/** Attempts left, time limit, best score and the cooldown of a TEST item. */
export function TestAttemptInfo({ item }: { item: SpaceItemRead }) {
  const t = useTranslations();
  const format = useFormatter();
  // One clock reading per mount: a cooldown that ends shows after the next refetch.
  const [now] = useState(() => new Date());

  const parts = [
    item.maxAttempts !== null && item.maxAttempts !== undefined && item.attemptsLeft !== null
      ? t('courses.attempts_left', { left: item.attemptsLeft ?? 0, max: item.maxAttempts })
      : null,
    item.timeLimitMinutes ? t('courses.time_limit', { minutes: item.timeLimitMinutes }) : null,
    item.bestScore !== null && item.bestScore !== undefined
      ? t('courses.best_score', { score: Math.round(item.bestScore) })
      : null,
    item.nextAttemptAt && item.nextAttemptAt.getTime() > now.getTime()
      ? t('courses.next_attempt', {
          date: format.dateTime(item.nextAttemptAt, { dateStyle: 'short', timeStyle: 'short' }),
        })
      : null,
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) return null;

  return (
    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline" data-testid="test-attempt-info">
      {parts.join(' · ')}
    </span>
  );
}

/** Start / Resume for a viewer. With no attempt left, or in a cooldown, the button is off. */
export function TestAttemptButton({ course, item }: { course: SpaceDetail; item: SpaceItemRead }) {
  const t = useTranslations();
  const [now] = useState(() => new Date());

  if (!canTrackProgress(course)) return null;

  const action = attemptAction(item, now);
  if (action === 'no_attempts_left' || action === 'cooldown') {
    return (
      <Button size="sm" variant="outline" disabled>
        {t(action === 'cooldown' ? 'courses.cooldown_wait' : 'courses.no_attempts_left')}
      </Button>
    );
  }

  const isResume = action === 'resume';
  return (
    <Button asChild size="sm" variant={isResume ? 'outline' : 'default'}>
      <Link href={courseAttemptHref(course, item.id)}>
        {isResume ? <RotateCcw /> : <Play />}
        {t(isResume ? 'courses.resume_attempt' : 'courses.start_attempt')}
      </Link>
    </Button>
  );
}
