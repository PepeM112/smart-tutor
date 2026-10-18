// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { attemptDraftKey, readAttemptAnswers, useAttemptDraft } from './useAttemptDraft';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useAttemptDraft', () => {
  it('saves the answers under a key of user and attempt, and reads them back', () => {
    const first = renderHook(() => useAttemptDraft('u1', 'a1'));
    first.result.current.save({ q1: 'ir' });

    expect(window.localStorage.getItem('st:attempt:u1:a1')).toBe('{"q1":"ir"}');

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
});
