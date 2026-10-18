import { type SpaceItemRead } from '@/client';

type ScheduleFields = Pick<SpaceItemRead, 'dueAt' | 'opensAt' | 'closesAt' | 'visibleFrom'>;

/** The state of the window of a test: before `opensAt`, between the two dates, or after `closesAt`. */
export type WindowState = 'not_open' | 'open' | 'closed';

/** One schedule line of an item. The page turns the kind into a text ("Due <date>"). */
export type ScheduleLabel = {
  kind: 'scheduled' | 'due' | 'opens' | 'closes' | 'closed';
  date: Date;
};

const isFuture = (date: Date | null | undefined, now: Date): date is Date =>
  Boolean(date) && (date as Date).getTime() > now.getTime();

/** True when the item is not visible to students yet (`visibleFrom` in the future). */
export function isHiddenByVisibleFrom(item: Pick<ScheduleFields, 'visibleFrom'>, now: Date): boolean {
  return isFuture(item.visibleFrom, now);
}

/** Is the test open now? No window dates = always open. */
export function windowState(item: Pick<ScheduleFields, 'opensAt' | 'closesAt'>, now: Date): WindowState {
  if (isFuture(item.opensAt, now)) return 'not_open';
  if (item.closesAt && item.closesAt.getTime() <= now.getTime()) return 'closed';
  return 'open';
}

/**
 * The schedule lines to show for an item, in this order: scheduled (authors only), due, window.
 * "Scheduled" only shows to authors, because students never get an item that is not visible yet.
 * A window that is open and has no `closesAt` gives no line.
 */
export function scheduleLabels(item: ScheduleFields, now: Date, isAuthor: boolean): ScheduleLabel[] {
  const state = windowState(item, now);
  const labels: (ScheduleLabel | null)[] = [
    isAuthor && isFuture(item.visibleFrom, now) ? { kind: 'scheduled', date: item.visibleFrom } : null,
    item.dueAt ? { kind: 'due', date: item.dueAt } : null,
    state === 'not_open' ? { kind: 'opens', date: item.opensAt as Date } : null,
    state === 'open' && item.closesAt ? { kind: 'closes', date: item.closesAt } : null,
    state === 'closed' ? { kind: 'closed', date: item.closesAt as Date } : null,
  ];
  return labels.filter((label): label is ScheduleLabel => label !== null);
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** A `Date` as the value of an `<input type="datetime-local">` (local time, no seconds). Empty for no date. */
export function toLocalInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The value of a datetime-local input as a `Date`. Empty or bad text gives null (the field is cleared). */
export function fromLocalInputValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
