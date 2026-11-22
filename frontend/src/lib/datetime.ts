import { DateTime, type DateTimeFormatOptions } from 'luxon';

/**
 * The one place for the user's time zone and clock format. Components never call `toLocale*String`,
 * `Intl.DateTimeFormat` or `new Date(y, m, d)` for a date the user sees or types.
 * Stored values are always UTC. The zone only matters when a date is shown or when a wall time is read.
 */

export type TimeFormat = '12h' | '24h';

export type DateTimePrefs = {
  /** An IANA zone name, for example `Europe/Madrid`. Always valid: use `resolveZone` to get one. */
  zone: string;
  hour12: boolean;
  /** The text locale. Unset = the browser locale. */
  locale?: string;
};

/** A calendar day, without a zone. `month` is 1–12 (Luxon style, not the `Date` 0–11). */
export type DayParts = { year: number; month: number; day: number };

/** The clock reading a person sees in a zone. */
export type WallTime = DayParts & { hour: number; minute: number };

export const DEFAULT_TIME_FORMAT: TimeFormat = '24h';

export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** `null` (the user did not choose a zone) and a zone name the runtime does not know both give the browser zone. */
export function resolveZone(timezone: string | null | undefined): string {
  if (!timezone) return browserZone();
  return DateTime.local().setZone(timezone).isValid ? timezone : browserZone();
}

export function createPrefs(
  timeFormat: TimeFormat | null | undefined,
  timezone: string | null | undefined,
  locale?: string
): DateTimePrefs {
  return { zone: resolveZone(timezone), hour12: (timeFormat ?? DEFAULT_TIME_FORMAT) === '12h', locale };
}

type DateInput = Date | string | number;

function toDateTime(value: DateInput, prefs: DateTimePrefs): DateTime {
  const parsed =
    value instanceof Date
      ? DateTime.fromJSDate(value)
      : typeof value === 'string'
        ? DateTime.fromISO(value)
        : DateTime.fromMillis(value);
  const zoned = parsed.setZone(prefs.zone);
  return prefs.locale ? zoned.setLocale(prefs.locale) : zoned;
}

// `hourCycle` (not `hour12`) because `hour12: false` can print midnight as "24:00" in some locales.
const timeOptions = (hour12: boolean): DateTimeFormatOptions => ({
  hour: hour12 ? 'numeric' : '2-digit',
  minute: '2-digit',
  hourCycle: hour12 ? 'h12' : 'h23',
});

const DATE_OPTIONS: Record<DateStyle, DateTimeFormatOptions> = {
  medium: { year: 'numeric', month: 'short', day: 'numeric' },
  short: { year: 'numeric', month: 'numeric', day: 'numeric' },
};

/** `medium` = "Nov 21, 2026". `short` = "11/21/2026" (the order follows the locale). */
export type DateStyle = 'medium' | 'short';

/** "Nov 21, 2026, 14:05" or "Nov 21, 2026, 2:05 PM". */
export function formatDateTime(value: DateInput, prefs: DateTimePrefs, style: DateStyle = 'medium'): string {
  return toDateTime(value, prefs).toLocaleString({ ...DATE_OPTIONS[style], ...timeOptions(prefs.hour12) });
}

/** "Nov 21, 2026". The day is the day in the user zone, not the browser zone. */
export function formatDate(value: DateInput, prefs: DateTimePrefs, style: DateStyle = 'medium'): string {
  return toDateTime(value, prefs).toLocaleString(DATE_OPTIONS[style]);
}

/** A calendar day as text. It has no zone, so it never moves to the day before or after. */
export function formatDay(day: DayParts, prefs: DateTimePrefs, style: DateStyle = 'medium'): string {
  return toDateTime(DateTime.fromObject(day, { zone: 'utc' }).toMillis(), { ...prefs, zone: 'utc' }).toLocaleString(
    DATE_OPTIONS[style]
  );
}

/** "14:05" or "2:05 PM". */
export function formatTime(value: DateInput, prefs: DateTimePrefs): string {
  return toDateTime(value, prefs).toLocaleString(timeOptions(prefs.hour12));
}

/** The hour as the 12h clock prints it: 0 and 12 give 12. */
export const to12Hour = (hour: number): number => hour % 12 || 12;

/**
 * The UTC instant of a wall time in a zone.
 * A time that does not exist (the hour skipped by the spring DST change) moves forward by the gap.
 * A time that exists twice (the hour repeated in autumn) gives the later one (standard time).
 */
export function toUtcIso(wall: WallTime, zone: string): string {
  const instant = DateTime.fromObject(wall, { zone }).toUTC().toISO();
  if (!instant) throw new RangeError(`Invalid wall time in ${zone}: ${JSON.stringify(wall)}`);
  return instant;
}

export function fromUtcIso(value: DateInput, zone: string): WallTime {
  const { year, month, day, hour, minute } = toDateTime(value, { zone, hour12: false });
  return { year, month, day, hour, minute };
}

export function dayPartsOf(value: DateInput, zone: string): DayParts {
  const { year, month, day } = fromUtcIso(value, zone);
  return { year, month, day };
}

export function todayParts(zone: string, now: Date = new Date()): DayParts {
  return dayPartsOf(now, zone);
}

/** Epoch ms of 00:00:00.000 of a day in a zone. A filter `from` uses it. */
export function startOfDayMs(day: DayParts, zone: string): number {
  return DateTime.fromObject(day, { zone }).startOf('day').toMillis();
}

/** Epoch ms of 23:59:59.999 of a day in a zone. A filter `to` uses it, so the whole day is inside the range. */
export function endOfDayMs(day: DayParts, zone: string): number {
  return DateTime.fromObject(day, { zone }).endOf('day').toMillis();
}

export function shiftDay(day: DayParts, days: number): DayParts {
  // UTC for the arithmetic: a calendar day has no DST.
  const { year, month, day: d } = DateTime.fromObject(day, { zone: 'utc' }).plus({ days });
  return { year, month, day: d };
}

export function monthEdges(day: DayParts): { first: DayParts; last: DayParts } {
  const start = DateTime.fromObject(day, { zone: 'utc' }).startOf('month');
  const end = start.endOf('month');
  return {
    first: { year: start.year, month: start.month, day: start.day },
    last: { year: end.year, month: end.month, day: end.day },
  };
}

export const isSameDay = (a: DayParts, b: DayParts): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day;

// The calendar (react-day-picker) works with browser-local `Date`s. These two convert a day to and from one.
// Only the year, month and day are read or set, so the browser zone does not leak into the result.
export const dateFromDay = ({ year, month, day }: DayParts): Date => new Date(year, month - 1, day);

export const dayFromDate = (date: Date): DayParts => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
});
