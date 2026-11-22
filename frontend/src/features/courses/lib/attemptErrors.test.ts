import { describe, expect, it } from 'vitest';

import { classifyAttemptRefusal } from './attemptErrors';

describe('classifyAttemptRefusal', () => {
  it.each([
    ['attempt_no_attempts_left', 'no_attempts_left'],
    ['attempt_time_over', 'time_over'],
    ['attempt_closed', 'closed'],
    ['space_archived', 'archived'],
    ['attempt_not_open', 'not_open'],
    ['attempt_window_closed', 'window_closed'],
    ['attempt_no_questions', 'no_questions'],
    ['a_new_code', 'unknown'],
  ])('maps the code %s to %s', (code, kind) => {
    expect(classifyAttemptRefusal({ detail: 'Any text', code }).kind).toBe(kind);
  });

  it('reads the date of a cooldown from the structured field', () => {
    const result = classifyAttemptRefusal({
      detail: 'Any text',
      code: 'attempt_cooldown',
      nextAttemptAt: '2026-05-01T10:30:00Z',
    });
    expect(result).toEqual({ kind: 'cooldown', nextAttemptAt: new Date('2026-05-01T10:30:00Z') });
  });

  it('keeps a cooldown with a bad date', () => {
    expect(classifyAttemptRefusal({ code: 'attempt_cooldown', nextAttemptAt: 'later' })).toEqual({
      kind: 'cooldown',
      nextAttemptAt: null,
    });
    expect(classifyAttemptRefusal({ code: 'attempt_cooldown' })).toEqual({ kind: 'cooldown', nextAttemptAt: null });
  });

  it('does not read the detail text', () => {
    expect(classifyAttemptRefusal({ detail: 'No attempts left' }).kind).toBe('unknown');
  });

  it('gives unknown for no error body', () => {
    expect(classifyAttemptRefusal(undefined).kind).toBe('unknown');
  });
});
