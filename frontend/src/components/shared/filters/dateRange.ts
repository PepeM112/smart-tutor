import { dayPartsOf, endOfDayMs, isSameDay, monthEdges, shiftDay, startOfDayMs, type DayParts } from '@/lib/datetime';
import { type DateFilterValue } from '@/lib/filters';

export interface DayRange {
  from?: DayParts;
  to?: DayParts;
}

export type PresetId = 'today' | 'last_7_days' | 'last_30_days' | 'this_month';

export const PRESET_IDS: PresetId[] = ['today', 'last_7_days', 'last_30_days', 'this_month'];

const dayKey = ({ year, month, day }: DayParts): number => year * 10_000 + month * 100 + day;

/**
 * The range after a click on a day. The first click sets the start. A second click on or after it sets
 * the end, a second click before it swaps the two. A click on a finished range starts a new one.
 */
export function pickDay(range: DayRange, day: DayParts): DayRange {
  const { from, to } = range;
  if (!from || to) return { from: day };
  return dayKey(day) >= dayKey(from) ? { from, to: day } : { from: day, to: from };
}

export function presetRange(id: PresetId, today: DayParts): Required<DayRange> {
  const { first, last } = monthEdges(today);
  const ranges: Record<PresetId, Required<DayRange>> = {
    today: { from: today, to: today },
    last_7_days: { from: shiftDay(today, -6), to: today },
    last_30_days: { from: shiftDay(today, -29), to: today },
    this_month: { from: first, to: last },
  };
  return ranges[id];
}

export function isRangeEqual(a: DayRange, b: DayRange): boolean {
  const isSame = (x?: DayParts, y?: DayParts): boolean => (x && y ? isSameDay(x, y) : x === y);
  return isSame(a.from, b.from) && isSame(a.to, b.to);
}

/** Days from start to end, both included. */
export function countDays({ from, to }: Required<DayRange>): number {
  const utc = ({ year, month, day }: DayParts): number => Date.UTC(year, month - 1, day);
  return Math.round((utc(to) - utc(from)) / 86_400_000) + 1;
}

/** The days of a stored filter value, read in the user zone. */
export function toDayRange(value: DateFilterValue | undefined, zone: string): DayRange {
  return {
    from: value?.from && dayPartsOf(value.from, zone),
    to: value?.to && dayPartsOf(value.to, zone),
  };
}

/**
 * The stored value of a range of days. `to` is the last millisecond of its day, so the whole last day is
 * inside the range (the backend compares with `<=`).
 */
export function toFilterValue(range: DayRange, zone: string): DateFilterValue | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from && { from: new Date(startOfDayMs(range.from, zone)) }),
    ...(range.to && { to: new Date(endOfDayMs(range.to, zone)) }),
  };
}
