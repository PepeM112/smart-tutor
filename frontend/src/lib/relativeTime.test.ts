import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './relativeTime';

const NOW = new Date('2026-05-10T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('says "now" under one minute, also for a time a little ahead', () => {
    expect(formatRelativeTime(ago(20_000), 'en', NOW)).toBe('now');
    expect(formatRelativeTime(ago(-20_000), 'en', NOW)).toBe('now');
  });

  it.each([
    [5 * MIN, '5 minutes ago'],
    [59 * MIN, '59 minutes ago'],
    [3 * HOUR, '3 hours ago'],
    [DAY, 'yesterday'],
    [3 * DAY, '3 days ago'],
    [14 * DAY, '2 weeks ago'],
    [90 * DAY, '3 months ago'],
    [400 * DAY, 'last year'],
  ])('formats %d ms in the past in English', (ms, text) => {
    expect(formatRelativeTime(ago(ms), 'en', NOW)).toBe(text);
  });

  it('formats a time in the future', () => {
    expect(formatRelativeTime(ago(-2 * HOUR), 'en', NOW)).toBe('in 2 hours');
  });

  it('uses the locale', () => {
    expect(formatRelativeTime(ago(5 * MIN), 'es', NOW)).toBe('hace 5 minutos');
    expect(formatRelativeTime(ago(DAY), 'es', NOW)).toBe('ayer');
  });
});
