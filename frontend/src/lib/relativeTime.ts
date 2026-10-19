const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// From the largest unit down. A month is 30 days and a year 365 days: the text is approximate by design.
const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * DAY_MS },
  { unit: 'month', ms: 30 * DAY_MS },
  { unit: 'week', ms: 7 * DAY_MS },
  { unit: 'day', ms: DAY_MS },
  { unit: 'hour', ms: HOUR_MS },
  { unit: 'minute', ms: MINUTE_MS },
];

/**
 * "5 minutes ago", "yesterday", "in 2 hours", in the given locale. Under one minute gives "now".
 * The value is cut toward zero, so "59 minutes ago" never rounds up to "1 hour ago".
 * `now` is a parameter so a test does not depend on the clock.
 */
export function formatRelativeTime(date: Date, locale: string, now: Date = new Date()): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = date.getTime() - now.getTime();
  const match = UNITS.find(({ ms }) => Math.abs(diffMs) >= ms);
  if (!match) return formatter.format(0, 'second');
  return formatter.format(Math.trunc(diffMs / match.ms), match.unit);
}
