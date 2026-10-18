export type AttemptRefusal =
  | { kind: 'cooldown'; nextAttemptAt: Date | null }
  | { kind: 'no_attempts_left' | 'time_over' | 'closed' | 'archived' | 'no_questions' | 'unknown' };

const COOLDOWN_PREFIX = 'The next attempt is possible at ';

/**
 * Maps the `detail` text of an attempt 409 to a case. The backend sends English text only, so the
 * page matches these exact strings (`space_attempt_service.py`, `space_service.py`) and shows its own
 * translated text. If the backend text changes, the match fails and the case is `unknown` (a generic text).
 */
export function classifyAttemptRefusal(detail: string | undefined): AttemptRefusal {
  if (!detail) return { kind: 'unknown' };
  if (detail.startsWith(COOLDOWN_PREFIX)) {
    const date = new Date(detail.slice(COOLDOWN_PREFIX.length));
    return { kind: 'cooldown', nextAttemptAt: Number.isNaN(date.getTime()) ? null : date };
  }
  switch (detail) {
    case 'No attempts left':
      return { kind: 'no_attempts_left' };
    case 'Time is over':
      return { kind: 'time_over' };
    case 'This attempt is already closed':
    case 'This attempt can not be continued':
      return { kind: 'closed' };
    case 'The course is archived':
      return { kind: 'archived' };
    case 'This test has no questions available':
      return { kind: 'no_questions' };
    default:
      return { kind: 'unknown' };
  }
}
