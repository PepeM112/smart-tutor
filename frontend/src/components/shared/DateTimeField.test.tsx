// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createPrefs, type DateTimePrefs } from '@/lib/datetime';

import { DateTimeField } from './DateTimeField';

const prefs = vi.hoisted(() => ({ current: undefined as DateTimePrefs | undefined }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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

function setup(value: string | null, timeFormat: '12h' | '24h', timezone: string) {
  prefs.current = createPrefs(timeFormat, timezone, 'en');
  const onCommit = vi.fn();
  render(<DateTimeField id="field" value={value} onCommit={onCommit} />);
  return onCommit;
}

describe('DateTimeField', () => {
  it('shows the UTC value as the wall time of the user zone', () => {
    setup('2026-01-15T11:00:00.000Z', '24h', 'Europe/Madrid');

    expect(screen.getByRole('button').textContent?.replace(/\s/g, ' ')).toContain('Jan 15, 2026, 12:00');
  });

  it('shows the placeholder for an empty value', () => {
    setup(null, '24h', 'Europe/Madrid');

    expect(screen.getByRole('button').textContent).toContain('pick_date_time');
  });

  it('commits the same wall time as UTC when the zone differs from the browser zone', () => {
    const onCommit = setup('2026-07-15T10:00:00.000Z', '24h', 'Europe/Madrid');

    fireEvent.click(screen.getByRole('button'));
    // Madrid is UTC+2 in July: 12:00 stays 12:00 and is stored as 10:00Z.
    fireEvent.click(within(screen.getByRole('listbox', { name: 'minute' })).getByRole('option', { name: '30' }));
    fireEvent.click(screen.getByRole('button', { name: 'done' }));

    expect(onCommit).toHaveBeenCalledWith('2026-07-15T10:30:00.000Z');
  });

  it('does not commit when nothing changed, and clears with Clear', () => {
    const onCommit = setup('2026-07-15T10:00:00.000Z', '24h', 'Europe/Madrid');

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Jul 15, 2026/ }));
    fireEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('reads the 12h clock: AM at 12:00 gives midnight of the zone', () => {
    const onCommit = setup('2026-01-15T11:00:00.000Z', '12h', 'Europe/Madrid');

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('option', { name: 'AM' }));
    fireEvent.click(screen.getByRole('button', { name: 'done' }));

    // 12:00 PM becomes 12:00 AM (00:00) in Madrid, UTC+1: the evening before at 23:00Z.
    expect(onCommit).toHaveBeenCalledWith('2026-01-14T23:00:00.000Z');
  });
});
