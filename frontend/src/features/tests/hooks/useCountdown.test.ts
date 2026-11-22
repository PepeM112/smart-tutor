// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountdown } from './useCountdown';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const NOW = new Date('2026-01-01T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const inSeconds = (seconds: number): Date => new Date(NOW.getTime() + seconds * 1000);

describe('useCountdown', () => {
  it('returns null without a deadline', () => {
    const { result } = renderHook(() => useCountdown(null, vi.fn()));

    expect(result.current).toBeNull();
  });

  it('returns null again when the deadline is removed', () => {
    const deadline = inSeconds(30);
    const { result, rerender } = renderHook<number | null, { at: Date | null }>(({ at }) => useCountdown(at, vi.fn()), {
      initialProps: { at: deadline },
    });
    expect(result.current).toBe(30);

    rerender({ at: null });

    expect(result.current).toBeNull();
  });

  it('calls onTimeout once, at the deadline', () => {
    const onTimeout = vi.fn();
    const deadline = inSeconds(10);
    renderHook(() => useCountdown(deadline, onTimeout));

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // The display interval keeps running, but it must not call a second time.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('calls onTimeout again for a new deadline after one fired', () => {
    const onTimeout = vi.fn();
    const { rerender } = renderHook<number | null, { at: Date }>(({ at }) => useCountdown(at, onTimeout), {
      initialProps: { at: inSeconds(10) },
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);

    rerender({ at: inSeconds(20) });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(onTimeout).toHaveBeenCalledTimes(2);
  });

  it('does not call onTimeout again for a new Date object with the same time', () => {
    const onTimeout = vi.fn();
    const { rerender } = renderHook<number | null, { at: Date }>(({ at }) => useCountdown(at, onTimeout), {
      initialProps: { at: inSeconds(10) },
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    rerender({ at: inSeconds(10) });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('calls onTimeout at once when the deadline is already past at mount', () => {
    const onTimeout = vi.fn();
    const deadline = inSeconds(-30);
    renderHook(() => useCountdown(deadline, onTimeout));

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimeout after unmount', () => {
    const onTimeout = vi.fn();
    const deadline = inSeconds(10);
    const { unmount } = renderHook(() => useCountdown(deadline, onTimeout));

    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks the deadline when a hidden tab comes back, with no timer needed', () => {
    const onTimeout = vi.fn();
    const deadline = inSeconds(10);
    renderHook(() => useCountdown(deadline, onTimeout));

    // A throttled tab: the clock moved, but no timer ran.
    vi.setSystemTime(inSeconds(20));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('uses the latest onTimeout without a restart of the timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const deadline = inSeconds(10);
    const { rerender } = renderHook(({ onTimeout }) => useCountdown(deadline, onTimeout), {
      initialProps: { onTimeout: first },
    });

    rerender({ onTimeout: second });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
