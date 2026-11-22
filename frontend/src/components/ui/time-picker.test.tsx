// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TimePicker } from './time-picker';

const locale = vi.hoisted(() => ({ current: 'en' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => locale.current,
}));

afterEach(() => {
  cleanup();
  locale.current = 'en';
});

function setup(hour: number, minute: number, hour12 = false) {
  const onChange = vi.fn();
  render(<TimePicker value={{ hour, minute }} hour12={hour12} onChange={onChange} />);
  return onChange;
}

describe('TimePicker', () => {
  it('lists hours 0-23 and minutes 0-59 in 24h', () => {
    setup(9, 30);

    expect(screen.getByRole('listbox', { name: 'hour' }).querySelectorAll('[role=option]')).toHaveLength(24);
    expect(screen.getByRole('listbox', { name: 'minute' }).querySelectorAll('[role=option]')).toHaveLength(60);
    expect(screen.queryByRole('listbox', { name: 'am_pm' })).toBeNull();
  });

  it('lists hours 1-12 and an AM/PM column in 12h', () => {
    setup(0, 0, true);

    const options = Array.from(screen.getByRole('listbox', { name: 'hour' }).querySelectorAll('[role=option]'));
    expect(options.map(option => option.textContent)).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
    expect(
      within(screen.getByRole('listbox', { name: 'hour' })).getByRole('option', { name: '12', selected: true })
    ).toBeTruthy();
    expect(screen.getByRole('option', { name: 'AM', selected: true })).toBeTruthy();
  });

  it.each([
    ['en', 'AM', 'PM'],
    ['es', 'a. m.', 'p. m.'],
  ])('names the AM/PM column in the %s locale', (code, am, pm) => {
    locale.current = code;
    setup(14, 0, true);

    // Luxon separates "a. m." with a narrow no-break space.
    const labels = (selector: string): (string | undefined)[] =>
      Array.from(screen.getByRole('listbox', { name: 'am_pm' }).querySelectorAll(selector)).map(option =>
        option.textContent?.replace(/\s/g, ' ')
      );
    expect(labels('[role=option]')).toEqual([am, pm]);
    expect(labels('[aria-selected=true]')).toEqual([pm]);
  });

  it('does not wrap past the first or last hour', () => {
    const onChange = setup(0, 0);
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'hour' }), { key: 'ArrowUp' });
    expect(onChange).not.toHaveBeenCalled();

    cleanup();
    const onChangeEnd = setup(23, 59);
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'hour' }), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'minute' }), { key: 'ArrowDown' });
    expect(onChangeEnd).not.toHaveBeenCalled();
  });

  it('moves one step with the arrows and jumps with Home and End', () => {
    const onChange = setup(10, 30);
    const hours = screen.getByRole('listbox', { name: 'hour' });

    fireEvent.keyDown(hours, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 11, minute: 30 });
    fireEvent.keyDown(hours, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 0, minute: 30 });
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'minute' }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 10, minute: 59 });
  });

  it('keeps AM or PM when the 12h hour changes, and maps 12 to hour 0 or 12', () => {
    const onChange = setup(15, 0, true);

    const hours = within(screen.getByRole('listbox', { name: 'hour' }));
    fireEvent.click(hours.getByRole('option', { name: '12' }));
    expect(onChange).toHaveBeenLastCalledWith({ hour: 12, minute: 0 });
    fireEvent.click(hours.getByRole('option', { name: '4' }));
    expect(onChange).toHaveBeenLastCalledWith({ hour: 16, minute: 0 });
  });

  it('switches to AM and PM without changing the 12h hour', () => {
    const onChange = setup(15, 0, true);

    fireEvent.click(screen.getByRole('option', { name: 'AM' }));
    expect(onChange).toHaveBeenLastCalledWith({ hour: 3, minute: 0 });
  });
});
