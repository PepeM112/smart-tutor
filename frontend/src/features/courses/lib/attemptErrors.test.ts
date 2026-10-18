import { describe, expect, it } from 'vitest';

import { classifyAttemptRefusal } from './attemptErrors';

describe('classifyAttemptRefusal', () => {
  it.each([
    ['No attempts left', 'no_attempts_left'],
    ['Time is over', 'time_over'],
    ['This attempt is already closed', 'closed'],
    ['This attempt can not be continued', 'closed'],
    ['The course is archived', 'archived'],
    ['The classroom is archived', 'archived'],
    ['The test is not open yet', 'not_open'],
    ['The test is closed', 'window_closed'],
    ['This test has no questions available', 'no_questions'],
    ['Something new', 'unknown'],
  ])('maps "%s" to %s', (detail, kind) => {
    expect(classifyAttemptRefusal(detail).kind).toBe(kind);
  });

  it('reads the date of a cooldown', () => {
    const result = classifyAttemptRefusal('The next attempt is possible at 2026-05-01T10:30:00+00:00');
    expect(result).toEqual({ kind: 'cooldown', nextAttemptAt: new Date('2026-05-01T10:30:00+00:00') });
  });

  it('keeps a cooldown with a bad date', () => {
    expect(classifyAttemptRefusal('The next attempt is possible at later')).toEqual({
      kind: 'cooldown',
      nextAttemptAt: null,
    });
  });

  it('gives unknown for no detail', () => {
    expect(classifyAttemptRefusal(undefined).kind).toBe('unknown');
  });
});
