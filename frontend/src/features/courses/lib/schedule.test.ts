import { describe, expect, it } from 'vitest';

import { fromLocalInputValue, isHiddenByVisibleFrom, scheduleLabels, toLocalInputValue, windowState } from './schedule';

const now = new Date(2026, 4, 10, 12, 0);
const at = (hours: number): Date => new Date(now.getTime() + hours * 3_600_000);

describe('isHiddenByVisibleFrom', () => {
  it('is true only for a future date', () => {
    expect(isHiddenByVisibleFrom({ visibleFrom: at(1) }, now)).toBe(true);
    expect(isHiddenByVisibleFrom({ visibleFrom: at(-1) }, now)).toBe(false);
    expect(isHiddenByVisibleFrom({ visibleFrom: null }, now)).toBe(false);
    expect(isHiddenByVisibleFrom({}, now)).toBe(false);
  });
});

describe('windowState', () => {
  it('is open with no dates', () => {
    expect(windowState({}, now)).toBe('open');
  });

  it('is not open before opensAt', () => {
    expect(windowState({ opensAt: at(2) }, now)).toBe('not_open');
  });

  it('is closed at and after closesAt', () => {
    expect(windowState({ closesAt: now }, now)).toBe('closed');
    expect(windowState({ opensAt: at(-5), closesAt: at(-1) }, now)).toBe('closed');
  });

  it('is open between the two dates', () => {
    expect(windowState({ opensAt: at(-1), closesAt: at(1) }, now)).toBe('open');
  });
});

describe('scheduleLabels', () => {
  it('shows "scheduled" to authors only', () => {
    expect(scheduleLabels({ visibleFrom: at(3) }, now, true)).toEqual([{ kind: 'scheduled', date: at(3) }]);
    expect(scheduleLabels({ visibleFrom: at(3) }, now, false)).toEqual([]);
  });

  it('gives due and the window line in order', () => {
    expect(scheduleLabels({ dueAt: at(24), opensAt: at(2) }, now, false)).toEqual([
      { kind: 'due', date: at(24) },
      { kind: 'opens', date: at(2) },
    ]);
  });

  it('gives "closes" for an open window and "closed" after it', () => {
    expect(scheduleLabels({ opensAt: at(-1), closesAt: at(4) }, now, false)).toEqual([{ kind: 'closes', date: at(4) }]);
    expect(scheduleLabels({ closesAt: at(-4) }, now, false)).toEqual([{ kind: 'closed', date: at(-4) }]);
  });

  it('gives nothing for an item with no schedule', () => {
    expect(scheduleLabels({}, now, true)).toEqual([]);
  });
});

describe('datetime-local conversion', () => {
  it('round-trips a local date', () => {
    const value = toLocalInputValue(new Date(2026, 0, 5, 9, 7));
    expect(value).toBe('2026-01-05T09:07');
    expect(fromLocalInputValue(value)).toEqual(new Date(2026, 0, 5, 9, 7));
  });

  it('gives empty text for no date and null for empty or bad text', () => {
    expect(toLocalInputValue(null)).toBe('');
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('nope')).toBeNull();
  });
});
