// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { clearUnconfirmedChanges } from '../hooks/unconfirmedUserChanges';
import { SAVE_DELAY_MS } from '../hooks/useDebouncedUpdateUser';

import { TimeFormatPicker } from './TimeFormatPicker';
import { TimezoneSelect } from './TimezoneSelect';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { zone?: string }) => (values?.zone ? `${key}:${values.zone}` : key),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({ sdk: { usersUpdateMe: vi.fn() } }));

const updateMe = vi.mocked(sdk.usersUpdateMe);
const userWith = (fields: Partial<UserRead>): UserRead => ({ id: 'u1', ...fields }) as UserRead;

function renderWithUser(ui: React.ReactElement, user: UserRead): QueryClient {
  useAuthStore.setState({ user });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(['me'], { data: user });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}

// jsdom lacks the pointer and layout APIs that Radix Select calls when its list opens
function chooseOption(trigger: HTMLElement, optionName: string): void {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  window.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});
// Only the timers that hold the save delay are faked: Radix and Testing Library need the others.
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.clearAllMocks();
  clearUnconfirmedChanges();
  // The real list has about 400 zones, which makes the jsdom render of the open list too slow.
  vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['America/New_York', 'Europe/Madrid']);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TimeFormatPicker', () => {
  it('shows 24h as the selected format when the user has none', () => {
    renderWithUser(<TimeFormatPicker />, userWith({}));

    expect(screen.getByRole('radio', { name: 'settings.time_format_24h' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'settings.time_format_12h' }).getAttribute('aria-checked')).toBe('false');
  });

  it('saves the chosen format and puts the saved user in the me cache', async () => {
    const saved = userWith({ timeFormat: '12h' });
    updateMe.mockResolvedValueOnce({ data: saved } as never);
    const client = renderWithUser(<TimeFormatPicker />, userWith({ timeFormat: '24h' }));

    fireEvent.click(screen.getByRole('radio', { name: 'settings.time_format_12h' }));

    await advance(SAVE_DELAY_MS);

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(updateMe).toHaveBeenCalledWith({ body: { timeFormat: '12h' } });
    expect(client.getQueryData(['me'])).toEqual({ data: saved });
    expect(useAuthStore.getState().user?.timeFormat).toBe('12h');
  });

  it('does not save when the active format is clicked again', async () => {
    renderWithUser(<TimeFormatPicker />, userWith({ timeFormat: '24h' }));

    fireEvent.click(screen.getByRole('radio', { name: 'settings.time_format_24h' }));
    await advance(SAVE_DELAY_MS);

    expect(updateMe).not.toHaveBeenCalled();
  });

  it('moves the choice with the arrow keys', () => {
    updateMe.mockResolvedValue({ data: userWith({ timeFormat: '12h' }) } as never);
    renderWithUser(<TimeFormatPicker />, userWith({ timeFormat: '24h' }));

    fireEvent.keyDown(screen.getByRole('radio', { name: 'settings.time_format_24h' }), { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: 'settings.time_format_12h' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'settings.time_format_12h' }));
  });

  it('shows an error toast when the save fails', async () => {
    updateMe.mockRejectedValueOnce(new Error('boom'));
    renderWithUser(<TimeFormatPicker />, userWith({ timeFormat: '24h' }));

    fireEvent.click(screen.getByRole('radio', { name: 'settings.time_format_12h' }));

    await advance(SAVE_DELAY_MS);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe('TimezoneSelect', () => {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  it('shows the automatic option with the browser zone when no zone is saved', () => {
    renderWithUser(<TimezoneSelect />, userWith({ timezone: null }));

    expect(screen.getByLabelText('settings.timezone_label').textContent).toBe(
      `settings.timezone_automatic:${browserZone}`
    );
  });

  it('saves the chosen zone', async () => {
    updateMe.mockResolvedValueOnce({ data: userWith({ timezone: 'Europe/Madrid' }) } as never);
    renderWithUser(<TimezoneSelect />, userWith({ timezone: null }));

    chooseOption(screen.getByLabelText('settings.timezone_label'), 'Europe/Madrid');

    await advance(SAVE_DELAY_MS);

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(updateMe).toHaveBeenCalledWith({ body: { timezone: 'Europe/Madrid' } });
  });

  it('saves null when the user goes back to automatic', async () => {
    updateMe.mockResolvedValueOnce({ data: userWith({ timezone: null }) } as never);
    renderWithUser(<TimezoneSelect />, userWith({ timezone: 'Europe/Madrid' }));

    chooseOption(screen.getByLabelText('settings.timezone_label'), `settings.timezone_automatic:${browserZone}`);

    await advance(SAVE_DELAY_MS);

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(updateMe).toHaveBeenCalledWith({ body: { timezone: null } });
  });
});
