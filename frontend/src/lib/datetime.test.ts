import { Settings } from 'luxon';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPrefs,
  dayFromDate,
  dateFromDay,
  dayPartsOf,
  endOfDayMs,
  formatDate,
  formatDay,
  formatDateTime,
  formatTime,
  fromUtcIso,
  monthEdges,
  resolveZone,
  shiftDay,
  startOfDayMs,
  to12Hour,
  toUtcIso,
  type DateTimePrefs,
} from './datetime';

const MADRID = 'Europe/Madrid';
const HOUR = 3_600_000;
const prefs = (zone: string, hour12: boolean): DateTimePrefs => ({ zone, hour12, locale: 'en' });
// Intl puts a narrow no-break space before AM/PM in newer ICU versions.
const plain = (text: string): string => text.replace(/\s/g, ' ');

describe('resolveZone / createPrefs', () => {
  it('uses the browser zone for null and for an unknown name', () => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveZone(null)).toBe(browser);
    expect(resolveZone(undefined)).toBe(browser);
    expect(resolveZone('Mars/Olympus')).toBe(browser);
  });

  it('keeps a valid manual zone', () => {
    expect(resolveZone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it('defaults to 24h and maps 12h to hour12', () => {
    expect(createPrefs(undefined, null).hour12).toBe(false);
    expect(createPrefs('24h', null).hour12).toBe(false);
    expect(createPrefs('12h', 'Asia/Tokyo')).toMatchObject({ zone: 'Asia/Tokyo', hour12: true });
  });
});

describe('formatting', () => {
  const iso = '2026-11-21T14:05:00Z';

  it('formats the time in 24h and 12h', () => {
    expect(plain(formatTime(iso, prefs('UTC', false)))).toBe('14:05');
    expect(plain(formatTime(iso, prefs('UTC', true)))).toBe('2:05 PM');
  });

  it('prints midnight as 00:00 in 24h and 12:00 AM in 12h', () => {
    const midnight = '2026-11-21T00:00:00Z';
    expect(plain(formatTime(midnight, prefs('UTC', false)))).toBe('00:00');
    expect(plain(formatTime(midnight, prefs('UTC', true)))).toBe('12:00 AM');
  });

  it('formats date and date-time', () => {
    expect(formatDate(iso, prefs('UTC', false))).toBe('Nov 21, 2026');
    expect(plain(formatDateTime(iso, prefs('UTC', false)))).toBe('Nov 21, 2026, 14:05');
    expect(plain(formatDateTime(iso, prefs('UTC', true)))).toBe('Nov 21, 2026, 2:05 PM');
  });

  it('shows the time of the chosen zone', () => {
    // Madrid is UTC+1 in November.
    expect(plain(formatTime(iso, prefs(MADRID, false)))).toBe('15:05');
    expect(plain(formatTime(iso, prefs('Asia/Tokyo', false)))).toBe('23:05');
  });

  it('shows the day of the chosen zone, not of the browser', () => {
    expect(formatDate('2026-11-21T23:30:00Z', prefs('Asia/Tokyo', false))).toBe('Nov 22, 2026');
    expect(formatDate('2026-11-21T23:30:00Z', prefs('UTC', false))).toBe('Nov 21, 2026');
  });

  it('formats a calendar day without moving it', () => {
    const day = { year: 2026, month: 11, day: 21 };
    expect(formatDay(day, prefs('Asia/Tokyo', false))).toBe('Nov 21, 2026');
    expect(formatDay(day, prefs('America/Los_Angeles', false))).toBe('Nov 21, 2026');
  });

  it('accepts a Date and epoch ms', () => {
    const date = new Date(iso);
    expect(plain(formatTime(date, prefs('UTC', false)))).toBe('14:05');
    expect(plain(formatTime(date.getTime(), prefs('UTC', false)))).toBe('14:05');
  });
});

describe('wall time <-> UTC', () => {
  it('converts in winter (UTC+1) and summer (UTC+2)', () => {
    expect(toUtcIso({ year: 2026, month: 1, day: 15, hour: 12, minute: 0 }, MADRID)).toBe('2026-01-15T11:00:00.000Z');
    expect(toUtcIso({ year: 2026, month: 7, day: 15, hour: 12, minute: 0 }, MADRID)).toBe('2026-07-15T10:00:00.000Z');
  });

  it('moves a time inside the spring gap forward (02:30 does not exist on 2026-03-29)', () => {
    expect(toUtcIso({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, MADRID)).toBe('2026-03-29T01:30:00.000Z');
  });

  // Luxon reads the offset of a repeated time from the clock, so the result must not depend on the month of "now".
  describe.each([
    ['July (summer time)', '2026-07-15T12:00:00Z'],
    ['December (standard time)', '2026-12-15T12:00:00Z'],
  ])('with the clock in %s', (_label, now) => {
    const realNow = Settings.now;
    beforeEach(() => {
      Settings.now = () => Date.parse(now);
    });
    afterEach(() => {
      Settings.now = realNow;
    });

    it('gives the later occurrence of a repeated autumn time (02:30 on 2026-10-25)', () => {
      // The second 02:30 is standard time (UTC+1).
      expect(toUtcIso({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, MADRID)).toBe(
        '2026-10-25T01:30:00.000Z'
      );
    });

    it('still moves a time inside the spring gap forward', () => {
      expect(toUtcIso({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, MADRID)).toBe('2026-03-29T01:30:00.000Z');
    });
  });

  it('round-trips every wall time of a normal day', () => {
    Array.from({ length: 24 }, (_, hour) => ({ year: 2026, month: 5, day: 20, hour, minute: 45 })).forEach(wall => {
      expect(fromUtcIso(toUtcIso(wall, MADRID), MADRID)).toEqual(wall);
    });
  });

  it('round-trips a UTC instant through a zone', () => {
    const iso = '2026-10-25T01:30:00.000Z';
    expect(toUtcIso(fromUtcIso(iso, MADRID), MADRID)).toBe(iso);
    // The first 02:30 (00:30Z) reads as the same wall time, so it resolves to the later one: the wall time alone is ambiguous.
    expect(fromUtcIso('2026-10-25T00:30:00.000Z', MADRID)).toEqual(fromUtcIso(iso, MADRID));
    expect(fromUtcIso(iso, MADRID)).toEqual({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 });
  });

  it('keeps the same wall time across the DST change (12:00 stays 12:00)', () => {
    const before = Date.parse(toUtcIso({ year: 2026, month: 3, day: 28, hour: 12, minute: 0 }, MADRID));
    const after = Date.parse(toUtcIso({ year: 2026, month: 3, day: 30, hour: 12, minute: 0 }, MADRID));
    expect(after - before).toBe(47 * HOUR);
  });
});

describe('day boundaries in a zone', () => {
  it('starts and ends a normal day', () => {
    const day = { year: 2026, month: 11, day: 21 };
    expect(new Date(startOfDayMs(day, MADRID)).toISOString()).toBe('2026-11-20T23:00:00.000Z');
    expect(new Date(endOfDayMs(day, MADRID)).toISOString()).toBe('2026-11-21T22:59:59.999Z');
  });

  it('has a 23 hour day in spring and a 25 hour day in autumn', () => {
    const length = (day: { year: number; month: number; day: number }): number =>
      endOfDayMs(day, MADRID) - startOfDayMs(day, MADRID) + 1;
    expect(length({ year: 2026, month: 3, day: 29 })).toBe(23 * HOUR);
    expect(length({ year: 2026, month: 10, day: 25 })).toBe(25 * HOUR);
  });

  it('reads the day of an instant in the zone', () => {
    expect(dayPartsOf('2026-11-21T23:30:00Z', 'Asia/Tokyo')).toEqual({ year: 2026, month: 11, day: 22 });
    expect(dayPartsOf(startOfDayMs({ year: 2026, month: 3, day: 29 }, MADRID), MADRID)).toEqual({
      year: 2026,
      month: 3,
      day: 29,
    });
  });
});

describe('day helpers', () => {
  it('shifts across a month and a year edge', () => {
    expect(shiftDay({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(shiftDay({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(shiftDay({ year: 2026, month: 11, day: 21 }, -29)).toEqual({ year: 2026, month: 10, day: 23 });
  });

  it('gives the first and last day of a month', () => {
    expect(monthEdges({ year: 2028, month: 2, day: 10 })).toEqual({
      first: { year: 2028, month: 2, day: 1 },
      last: { year: 2028, month: 2, day: 29 },
    });
  });

  it('converts a day to a calendar Date and back', () => {
    const day = { year: 2026, month: 11, day: 21 };
    expect(dayFromDate(dateFromDay(day))).toEqual(day);
  });

  it('maps the 12h clock', () => {
    expect([0, 1, 11, 12, 13, 23].map(to12Hour)).toEqual([12, 1, 11, 12, 1, 11]);
  });
});
