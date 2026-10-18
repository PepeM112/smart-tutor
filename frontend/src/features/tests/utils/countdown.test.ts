import { describe, expect, it } from 'vitest';

import { formatCountdown, secondsLeft } from './countdown';

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
