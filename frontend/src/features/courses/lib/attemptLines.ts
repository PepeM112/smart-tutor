import { type useTranslations } from 'next-intl';

import { type SpaceItemRead } from '@/client';
import { formatDateTime, type DateTimePrefs } from '@/lib/datetime';

import { attemptAction } from './progress';

/**
 * The rules of a test, one line each: time limit, attempts, test window and cooldown.
 * The start card and the test page of a course show the same lines.
 */
export function attemptPolicyLines(
  item: SpaceItemRead | undefined,
  now: Date,
  t: ReturnType<typeof useTranslations>,
  prefs: DateTimePrefs
): string[] {
  const isCooldown = item !== undefined && attemptAction(item, now) === 'cooldown';

  return [
    item?.timeLimitMinutes
      ? t('courses.attempt_time_limit', { minutes: item.timeLimitMinutes })
      : t('courses.attempt_no_time_limit'),
    item?.maxAttempts === null || item?.maxAttempts === undefined
      ? t('courses.attempt_unlimited')
      : t('courses.attempts_left', { left: item.attemptsLeft ?? 0, max: item.maxAttempts }),
    item?.opensAt ? t('courses.schedule_label_opens', { date: formatDateTime(item.opensAt, prefs, 'short') }) : null,
    item?.closesAt ? t('courses.schedule_label_closes', { date: formatDateTime(item.closesAt, prefs, 'short') }) : null,
    isCooldown && item?.nextAttemptAt
      ? t('courses.next_attempt', { date: formatDateTime(item.nextAttemptAt, prefs, 'short') })
      : null,
  ].filter((line): line is string => line !== null);
}
