import { useFormatter, useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { getErrorDetail } from '@/lib/utils';

import { classifyAttemptRefusal } from '../lib/attemptErrors';

/**
 * Turns a refused attempt call (HTTP 409) into text in the user language.
 * The server sends English text only, so the case comes from `classifyAttemptRefusal`.
 */
export function useAttemptRefusalMessage(): (error: unknown) => string {
  const t = useTranslations();
  const format = useFormatter();

  return useCallback(
    (error: unknown): string => {
      const refusal = classifyAttemptRefusal(getErrorDetail(error, ''));
      switch (refusal.kind) {
        case 'cooldown':
          return refusal.nextAttemptAt
            ? t('courses.attempt_error_cooldown', {
                date: format.dateTime(refusal.nextAttemptAt, { dateStyle: 'short', timeStyle: 'short' }),
              })
            : t('courses.cooldown_wait');
        case 'no_attempts_left':
          return t('courses.no_attempts_left');
        case 'time_over':
          return t('courses.attempt_error_time_over');
        case 'not_open':
          return t('courses.attempt_error_not_open');
        case 'window_closed':
          return t('courses.attempt_error_window_closed');
        case 'archived':
          return t('courses.attempt_error_archived');
        case 'no_questions':
          return t('courses.attempt_error_no_questions');
        case 'closed':
        case 'unknown':
          return t('courses.attempt_refused');
      }
    },
    [t, format]
  );
}
