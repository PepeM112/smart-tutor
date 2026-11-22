import { describe, expect, it } from 'vitest';

import { dayPartsOf } from '@/lib/datetime';
import { deserializeFilterValue, FilterType, serializeFilterValue, type FilterItem } from '@/lib/filters';

import { countDays, isRangeEqual, pickDay, presetRange, toDayRange, toFilterValue } from './dateRange';

const MADRID = 'Europe/Madrid';
const TODAY = { year: 2026, month: 11, day: 21 };
const day = (d: number, month = 11) => ({ year: 2026, month, day: d });

const ITEM: FilterItem = { label: 'Created', key: 'created', type: FilterType.DATE };

describe('pickDay', () => {
  it('sets the start on the first click', () => {
    expect(pickDay({}, day(10))).toEqual({ from: day(10) });
  });

  it('sets the end on a click on or after the start', () => {
    expect(pickDay({ from: day(10) }, day(15))).toEqual({ from: day(10), to: day(15) });
    expect(pickDay({ from: day(10) }, day(10))).toEqual({ from: day(10), to: day(10) });
  });

  it('swaps the days on a click before the start', () => {
    expect(pickDay({ from: day(10) }, day(3))).toEqual({ from: day(3), to: day(10) });
  });

  it('starts a new range when both ends are set', () => {
    expect(pickDay({ from: day(3), to: day(10) }, day(20))).toEqual({ from: day(20) });
  });
});

describe('presets', () => {
  it('gives the last 7 days with today included', () => {
    expect(presetRange('last_7_days', TODAY)).toEqual({ from: day(15), to: TODAY });
    expect(countDays(presetRange('last_7_days', TODAY))).toBe(7);
  });

  it('gives the whole current month', () => {
    expect(presetRange('this_month', TODAY)).toEqual({ from: day(1), to: day(30) });
    expect(isRangeEqual(presetRange('today', TODAY), { from: TODAY, to: TODAY })).toBe(true);
  });

  it('counts the days of a range that crosses a month edge', () => {
    expect(countDays({ from: day(28, 10), to: day(2) })).toBe(6);
  });
});

describe('date range value', () => {
  it('starts the first day at 00:00 and ends the last day at 23:59:59.999 in the zone', () => {
    const value = toFilterValue({ from: day(10), to: day(12) }, MADRID);

    expect(value?.from?.toISOString()).toBe('2026-11-09T23:00:00.000Z');
    expect(value?.to?.toISOString()).toBe('2026-11-12T22:59:59.999Z');
  });

  it('is empty without a day', () => {
    expect(toFilterValue({}, MADRID)).toBeUndefined();
  });

  it('keeps the picked days through the URL (epoch ms)', () => {
    const value = toFilterValue({ from: day(10), to: day(12) }, MADRID);
    if (!value) throw new Error('expected a value');
    const params = serializeFilterValue(ITEM, { created: value });
    expect(params).toEqual({ created_from: '1794265200000', created_to: '1794524399999' });

    const restored = deserializeFilterValue(ITEM, new URLSearchParams(params as Record<string, string>));
    expect(restored).toEqual(value);
    expect(toDayRange(value, MADRID)).toEqual({ from: day(10), to: day(12) });
  });

  it('reads an old URL (a `to` at the start of the day) as the same day', () => {
    const oldTo = Date.parse('2026-11-11T23:00:00.000Z');
    expect(dayPartsOf(oldTo, MADRID)).toEqual(day(12));
    expect(toDayRange({ to: new Date(oldTo) }, MADRID)).toEqual({ from: undefined, to: day(12) });
  });
});
