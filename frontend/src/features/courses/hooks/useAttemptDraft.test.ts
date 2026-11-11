// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { attemptDraftKey, DRAFT_MAX_AGE_MS, readAttemptAnswers, useAttemptDraft } from './useAttemptDraft';

const NOW = Date.parse('2030-01-15T12:00:00Z');
const storedDraft = (savedAt: number, answers: Record<string, string> = { q1: 'x' }): string =>
  JSON.stringify({ answers, savedAt });

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useAttemptDraft', () => {
  it('saves the answers with a timestamp under a key of user and attempt, and reads them back', () => {
    vi.useFakeTimers({ now: NOW });
    const first = renderHook(() => useAttemptDraft('u1', 'a1'));
    first.result.current.save({ q1: 'ir' });

    expect(JSON.parse(window.localStorage.getItem('st:attempt:u1:a1') ?? 'null')).toEqual({
      answers: { q1: 'ir' },
      savedAt: NOW,
    });

    const resumed = renderHook(() => useAttemptDraft('u1', 'a1'));
    expect(resumed.result.current.initialAnswers).toEqual({ q1: 'ir' });
  });

  it('keeps the answers of two users apart', () => {
    renderHook(() => useAttemptDraft('u1', 'a1')).result.current.save({ q1: 'x' });
    expect(renderHook(() => useAttemptDraft('u2', 'a1')).result.current.initialAnswers).toEqual({});
  });

  it('deletes the draft on clear', () => {
    const { result } = renderHook(() => useAttemptDraft('u1', 'a1'));
    result.current.save({ q1: 'x' });
    result.current.clear();
    expect(window.localStorage.getItem(attemptDraftKey('u1', 'a1'))).toBeNull();
  });

  it('keeps a recent draft of another attempt, so a second tab does not wipe the first', () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem('st:attempt:u1:other-tab', storedDraft(NOW - 60_000));

    renderHook(() => useAttemptDraft('u1', 'a1'));

    expect(window.localStorage.getItem('st:attempt:u1:other-tab')).not.toBeNull();
  });

  it('deletes the drafts of this user that are older than the max age, or have no timestamp', () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem('st:attempt:u1:stale', storedDraft(NOW - DRAFT_MAX_AGE_MS - 1));
    window.localStorage.setItem('st:attempt:u1:old-format', '{"q1":"x"}');
    window.localStorage.setItem('st:attempt:u2:stale', storedDraft(NOW - DRAFT_MAX_AGE_MS - 1));
    window.localStorage.setItem('unrelated', 'value');

    renderHook(() => useAttemptDraft('u1', 'a1'));

    expect(window.localStorage.getItem('st:attempt:u1:stale')).toBeNull();
    expect(window.localStorage.getItem('st:attempt:u1:old-format')).toBeNull();
    expect(window.localStorage.getItem('st:attempt:u2:stale')).not.toBeNull();
    expect(window.localStorage.getItem('unrelated')).toBe('value');
  });

  it('keeps the draft of the current attempt, even in the old format, and reads its answers', () => {
    window.localStorage.setItem('st:attempt:u1:a1', '{"q1":"keep"}');

    const { result } = renderHook(() => useAttemptDraft('u1', 'a1'));

    expect(result.current.initialAnswers).toEqual({ q1: 'keep' });
    expect(window.localStorage.getItem('st:attempt:u1:a1')).toBe('{"q1":"keep"}');
  });

  it('does nothing before the attempt is known', () => {
    const { result } = renderHook(() => useAttemptDraft('u1', null));
    result.current.save({ q1: 'x' });
    expect(window.localStorage.length).toBe(0);
    expect(result.current.initialAnswers).toEqual({});
  });

  it('survives a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useAttemptDraft('u1', 'a1'));
    expect(result.current.initialAnswers).toEqual({});
    expect(() => result.current.save({ q1: 'x' })).not.toThrow();
    expect(() => result.current.clear()).not.toThrow();
  });
});

describe('readAttemptAnswers', () => {
  it('returns {} for bad data and drops values that are not text', () => {
    window.localStorage.setItem('k1', 'not json');
    window.localStorage.setItem('k2', '[1,2]');
    window.localStorage.setItem('k3', '{"a":"x","b":3}');
    expect(readAttemptAnswers('k1')).toEqual({});
    expect(readAttemptAnswers('k2')).toEqual({});
    expect(readAttemptAnswers('k3')).toEqual({ a: 'x' });
  });

  it('reads the answers of the timestamped format', () => {
    window.localStorage.setItem('k1', storedDraft(NOW, { a: 'x' }));
    expect(readAttemptAnswers('k1')).toEqual({ a: 'x' });
  });
});
