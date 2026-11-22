import { describe, expect, it } from 'vitest';

import { errorCase, errorCode, errorDate, errorNumber } from './errorCode';

describe('errorCode', () => {
  it('reads the code of an error body', () => {
    expect(errorCode({ detail: 'Gone', code: 'feed_post_not_found', status: 404 })).toBe('feed_post_not_found');
  });

  it('gives undefined for an error without a code', () => {
    expect(errorCode({ detail: 'Gone' })).toBeUndefined();
    expect(errorCode({ code: 5 })).toBeUndefined();
    expect(errorCode('Gone')).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode(undefined)).toBeUndefined();
  });
});

describe('errorCase', () => {
  const table = { feed_post_not_found: 'a' } as const;

  it('gives the value of the code', () => {
    expect(errorCase(table, { code: 'feed_post_not_found' })).toBe('a');
  });

  it('gives undefined for another code or none', () => {
    expect(errorCase(table, { code: 'completion_passed' })).toBeUndefined();
    expect(errorCase(table, { detail: 'x' })).toBeUndefined();
  });

  it('does not match a name of Object.prototype', () => {
    expect(errorCase(table, { code: 'constructor' })).toBeUndefined();
  });
});

describe('errorNumber and errorDate', () => {
  it('read the fields of the body', () => {
    expect(errorNumber({ maxPoints: 2.5 }, 'maxPoints')).toBe(2.5);
    expect(errorDate({ nextAttemptAt: '2026-05-01T10:30:00Z' }, 'nextAttemptAt')).toEqual(
      new Date('2026-05-01T10:30:00Z')
    );
  });

  it('give undefined for a missing or bad field', () => {
    expect(errorNumber({ maxPoints: '2' }, 'maxPoints')).toBeUndefined();
    expect(errorNumber(undefined, 'maxPoints')).toBeUndefined();
    expect(errorDate({ nextAttemptAt: 'later' }, 'nextAttemptAt')).toBeUndefined();
    expect(errorDate({}, 'nextAttemptAt')).toBeUndefined();
  });
});
