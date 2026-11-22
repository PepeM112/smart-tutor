// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { clearUnconfirmedChanges } from '../hooks/unconfirmedUserChanges';
import { SAVE_DELAY_MS } from '../hooks/useDebouncedUpdateUser';

import { ThemePicker } from './ThemePicker';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({ sdk: { usersUpdateMe: vi.fn() } }));
const setTheme = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme }) }));

const updateMe = vi.mocked(sdk.usersUpdateMe);
const START_USER = { id: 'u1', theme: 'light' } as UserRead;
const reply = (theme: UserRead['theme']) => ({ data: { ...START_USER, theme } }) as never;

function renderPicker(): void {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemePicker />
    </QueryClientProvider>
  );
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  clearUnconfirmedChanges();
  useAuthStore.setState({ user: START_USER });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ThemePicker', () => {
  it('lists System first, then the light themes under Light and Dark under Dark', () => {
    renderPicker();

    const radios = screen.getAllByRole('radio').map(radio => radio.closest('label')?.textContent);
    expect(radios).toEqual([
      'settings.theme_system',
      'settings.theme_light',
      'settings.theme_light_frame',
      'settings.theme_light_ink',
      'settings.theme_light_ink_frame',
      'settings.theme_dark',
    ]);
    const light = screen.getByRole('group', { name: 'settings.theme_group_light' });
    expect(within(light).getAllByRole('radio')).toHaveLength(4);
    expect(within(screen.getByRole('group', { name: 'settings.theme_group_dark' })).getAllByRole('radio')).toHaveLength(
      1
    );
  });

  it('marks the active theme without an icon', () => {
    renderPicker();

    const active = screen.getByLabelText<HTMLInputElement>('settings.theme_light');
    expect(active.checked).toBe(true);
    expect(active.closest('label')?.querySelector('svg.lucide-check')).toBeNull();
  });

  it('applies the theme at once and saves only the last click after the delay', async () => {
    updateMe.mockResolvedValue(reply('light-ink'));
    renderPicker();

    fireEvent.click(screen.getByLabelText('settings.theme_dark'));
    fireEvent.click(screen.getByLabelText('settings.theme_system'));
    fireEvent.click(screen.getByLabelText('settings.theme_light_ink'));

    expect(setTheme.mock.calls).toEqual([['dark'], ['system'], ['light-ink']]);
    expect(updateMe).not.toHaveBeenCalled();

    await advance(SAVE_DELAY_MS);

    expect(updateMe.mock.calls).toEqual([[{ body: { theme: 'light-ink' } }]]);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('reverts the page to the saved theme when the save fails', async () => {
    updateMe.mockRejectedValueOnce(new Error('boom'));
    renderPicker();

    fireEvent.click(screen.getByLabelText('settings.theme_dark'));
    await advance(SAVE_DELAY_MS);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(setTheme.mock.calls).toEqual([['dark'], ['light']]);
  });
});
