import { type ErrorCode, errorCase, errorCode, errorDate } from '@/lib/errorCode';

export type AttemptRefusal =
  | { kind: 'cooldown'; nextAttemptAt: Date | null }
  | {
      kind:
        | 'no_attempts_left'
        | 'time_over'
        | 'closed'
        | 'not_open'
        | 'window_closed'
        | 'archived'
        | 'no_questions'
        | 'unknown';
    };

type SimpleRefusalKind = Exclude<AttemptRefusal['kind'], 'cooldown' | 'unknown'>;

const REFUSAL_KINDS: Partial<Record<ErrorCode, SimpleRefusalKind>> = {
  attempt_no_attempts_left: 'no_attempts_left',
  attempt_time_over: 'time_over',
  attempt_closed: 'closed',
  attempt_not_open: 'not_open',
  attempt_window_closed: 'window_closed',
  space_archived: 'archived',
  attempt_no_questions: 'no_questions',
};

/**
 * Maps the `code` of an attempt 409 to a case. The backend text is English only, so the page shows its own
 * translated text per case. A code that is not in the table gives `unknown` (a generic text).
 */
export function classifyAttemptRefusal(error: unknown): AttemptRefusal {
  if (errorCode(error) === 'attempt_cooldown') {
    return { kind: 'cooldown', nextAttemptAt: errorDate(error, 'nextAttemptAt') ?? null };
  }
  const kind = errorCase(REFUSAL_KINDS, error);
  return kind ? { kind } : { kind: 'unknown' };
}
