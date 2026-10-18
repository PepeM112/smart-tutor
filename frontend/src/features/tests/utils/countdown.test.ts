import { afterEach, describe, expect, it, vi } from 'vitest';

import { clockNow, formatCountdown, resetServerClock, secondsLeft, syncServerClock } from './countdown';

describe('secondsLeft', () => {
  const deadline = new Date('2026-01-01T10:00:00Z');

  it('rounds up and never goes below 0', () => {
    expect(secondsLeft(deadline, deadline.getTime() - 1500)).toBe(2);
    expect(secondsLeft(deadline, deadline.getTime())).toBe(0);
    expect(secondsLeft(deadline, deadline.getTime() + 5000)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('formats minutes and seconds', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(65)).toBe('1:05');
  });

  it('adds hours from one hour', () => {
    expect(formatCountdown(3600)).toBe('1:00:00');
    expect(formatCountdown(3725)).toBe('1:02:05');
  });
});

describe('clockNow', () => {
  afterEach(() => {
    resetServerClock();
    vi.useRealTimers();
  });

  it('uses the client clock until a server time is known', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    expect(clockNow()).toBe(Date.parse('2026-01-01T10:00:00Z'));
  });

  it('adds the gap between server and client time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    // The client clock is 5 minutes behind the server clock.
    syncServerClock(new Date('2026-01-01T10:05:00Z'), Date.now());
    expect(clockNow()).toBe(Date.parse('2026-01-01T10:05:00Z'));
    vi.advanceTimersByTime(1000);
    expect(clockNow()).toBe(Date.parse('2026-01-01T10:05:01Z'));
  });

  it('keeps the seconds left right when the client clock is wrong', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00Z'));
    const deadline = new Date('2026-01-01T10:30:00Z');
    syncServerClock(new Date('2026-01-01T10:00:00Z'));
    expect(secondsLeft(deadline, clockNow())).toBe(1800);
  });
});
