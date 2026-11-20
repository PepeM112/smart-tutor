'use client';

import { Play } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SpaceItemRead } from '@/client';
import { Button } from '@/components/ui/button';

import { attemptPolicyLines } from '../lib/attemptLines';
import { attemptAction } from '../lib/progress';
import { windowState } from '../lib/schedule';

type Props = {
  /** The test item from the course detail. Not set when the item is not in the published course. */
  item: SpaceItemRead | undefined;
  /** True while the start call runs. */
  isStarting: boolean;
  onStart: () => void;
};

/**
 * Shown before a new attempt. Opening the attempt URL starts nothing: the student sees the time limit,
 * the attempts left and any cooldown, then starts on purpose (a restored tab or a bookmark is safe).
 */
export function AttemptStartCard({ item, isStarting, onStart }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  // One clock reading per mount, as in the course outline.
  const [now] = useState(() => new Date());

  const action = item ? attemptAction(item, now) : 'start';
  // The test window: before it opens, or after it closes, a new attempt is refused (409).
  const window = item && action !== 'resume' ? windowState(item, now) : 'open';
  const isBlocked = action === 'no_attempts_left' || action === 'cooldown' || window !== 'open';
  const blockedLabel =
    window === 'not_open'
      ? 'courses.test_not_open'
      : window === 'closed'
        ? 'courses.test_closed'
        : action === 'cooldown'
          ? 'courses.cooldown_wait'
          : 'courses.no_attempts_left';
  const lines = attemptPolicyLines(item, now, t, format);

  return (
    <div
      className="mx-auto mt-8 flex max-w-lg flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-card"
      data-testid="attempt-start-card"
    >
      <h2 className="font-serif text-2xl font-medium text-foreground">{item?.title ?? t('tests.take_test')}</h2>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {lines.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="text-sm text-foreground">{t('courses.attempt_start_description')}</p>
      <Button icon={Play} className="self-start" loading={isStarting} disabled={isBlocked} onClick={onStart}>
        {t(isBlocked ? blockedLabel : 'courses.start_test')}
      </Button>
    </div>
  );
}
