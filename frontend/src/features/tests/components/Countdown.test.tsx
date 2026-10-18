// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Countdown } from './Countdown';

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

describe('Countdown', () => {
  it('calls onTimeout once, at the deadline', () => {
    const onTimeout = vi.fn();
    render(<Countdown deadlineAt={inSeconds(10)} onTimeout={onTimeout} />);

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

  it('calls onTimeout at once when the deadline is already past at mount', () => {
    const onTimeout = vi.fn();
    render(<Countdown deadlineAt={inSeconds(-30)} onTimeout={onTimeout} />);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimeout after unmount', () => {
    const onTimeout = vi.fn();
    const { unmount } = render(<Countdown deadlineAt={inSeconds(10)} onTimeout={onTimeout} />);

    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks the deadline when a hidden tab comes back, with no timer needed', () => {
    const onTimeout = vi.fn();
    render(<Countdown deadlineAt={inSeconds(10)} onTimeout={onTimeout} />);

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
    const { rerender } = render(<Countdown deadlineAt={deadline} onTimeout={first} />);

    rerender(<Countdown deadlineAt={deadline} onTimeout={second} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
