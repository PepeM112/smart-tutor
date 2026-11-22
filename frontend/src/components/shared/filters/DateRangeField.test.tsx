// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createPrefs, type DateTimePrefs } from '@/lib/datetime';
import { type DateFilterValue, type FilterItem, FilterType } from '@/lib/filters';

import { DateRangeField } from './DateRangeField';
import { FilterPopover } from './FilterPopover';

const prefs = vi.hoisted(() => ({ current: undefined as DateTimePrefs | undefined }));

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useLocale: () => 'en',
}));
vi.mock('@/hooks/useDateTimePrefs', () => ({ useDateTimePrefs: () => prefs.current }));

beforeAll(() => {
  // Radix Popper reads the element size with ResizeObserver, which jsdom does not have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const ZONE = 'Europe/Madrid';
const range = (from: string, to: string): DateFilterValue => ({
  from: new Date(from),
  to: new Date(to),
});
const NOV_3_TO_14 = range('2026-11-02T23:00:00.000Z', '2026-11-14T22:59:59.999Z');

function setup(value: DateFilterValue | undefined) {
  prefs.current = createPrefs('24h', ZONE, 'en');
  const onChange = vi.fn<(value: DateFilterValue | undefined) => void>();
  render(<DateRangeField value={value} onChange={onChange} />);
  return onChange;
}

describe('DateRangeField', () => {
  it('shows the placeholder without a value and no clear button', () => {
    setup(undefined);

    expect(screen.getByRole('button').textContent).toContain('filters_date.any');
    expect(screen.queryByLabelText('common.clear')).toBeNull();
  });

  it('shows the range in the trigger', () => {
    setup(NOV_3_TO_14);

    expect(screen.getByText(/Nov 3, 2026\s–\sNov 14, 2026/)).toBeTruthy();
  });

  it('shows one day as a single date', () => {
    setup(range('2026-11-02T23:00:00.000Z', '2026-11-03T22:59:59.999Z'));

    expect(screen.getByText('Nov 3, 2026')).toBeTruthy();
  });

  it('opens the presets and the calendar from the trigger, closed by default', () => {
    setup(undefined);
    expect(screen.queryByText('filters_date.today')).toBeNull();

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('filters_date.today')).toBeTruthy();
    expect(screen.getByRole('grid')).toBeTruthy();
  });

  it('has a focusable native button trigger that the browser opens with Enter and Space', () => {
    setup(undefined);
    const trigger = screen.getByRole('button');
    // The Radix trigger is a native button: the browser turns Enter and Space into a click.
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
  });

  it('applies a preset and closes the popover', () => {
    const onChange = setup(undefined);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByText('filters_date.last_7_days'));

    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.queryByText('filters_date.today')).toBeNull();
  });

  it('clears the value from the x button without opening the popover', () => {
    const onChange = setup(NOV_3_TO_14);

    fireEvent.click(screen.getByLabelText('common.clear'));

    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(screen.queryByText('filters_date.today')).toBeNull();
  });

  it('ends the range on the second click even when the value prop does not change', () => {
    const onChange = setup(undefined);
    fireEvent.click(screen.getByRole('button'));
    const days = screen.getAllByRole('gridcell').map(cell => cell.querySelector('button') as HTMLElement);

    fireEvent.click(days[10]);
    fireEvent.click(days[12]);

    expect(onChange).toHaveBeenCalledTimes(2);
    const [first, second] = onChange.mock.calls.map(([value]) => value);
    expect(first?.from).toBeInstanceOf(Date);
    expect(first?.to).toBeUndefined();
    expect(second?.from).toBeInstanceOf(Date);
    expect(second?.to).toBeInstanceOf(Date);
  });

  it('keeps the filter popover open while the inner one is used and closes only the inner one on Escape', () => {
    prefs.current = createPrefs('24h', ZONE, 'en');
    const config: FilterItem[] = [{ label: 'Created', key: 'created', type: FilterType.DATE }];
    render(<FilterPopover filterConfig={config} filters={{}} onFilterChange={vi.fn()} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /common.filters/ }));
    fireEvent.click(screen.getByText('filters_date.any'));
    expect(screen.getByText('filters_date.today')).toBeTruthy();

    // A pointer down on a day sits inside the inner popover, which is portaled outside the filter popover.
    const day = screen.getAllByRole('gridcell')[10].querySelector('button') as HTMLElement;
    fireEvent.pointerDown(day);
    fireEvent.click(day);
    expect(screen.getByText('Created')).toBeTruthy();

    fireEvent.keyDown(screen.getByText('filters_date.today'), { key: 'Escape' });

    expect(screen.queryByText('filters_date.today')).toBeNull();
    expect(screen.getByText('Created')).toBeTruthy();
  });
});
