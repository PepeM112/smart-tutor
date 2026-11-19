// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type UserRead } from '@/client';
import { sdk } from '@/lib/apiClient';

import { ThemePicker } from './ThemePicker';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({ sdk: { usersUpdateMe: vi.fn() } }));
const setTheme = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme }) }));

const updateMe = vi.mocked(sdk.usersUpdateMe);
const reply = (theme: UserRead['theme']) => ({ data: { id: 'u1', theme } as UserRead }) as never;

function renderPicker(): void {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemePicker />
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ThemePicker', () => {
  it('keeps the last click when an earlier save fails', async () => {
    updateMe.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(reply('system'));
    renderPicker();

    fireEvent.click(screen.getByLabelText('settings.theme_dark'));
    fireEvent.click(screen.getByLabelText('settings.theme_system'));

    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(updateMe.mock.calls.map(([options]) => options?.body?.theme)).toEqual(['dark', 'system']);
    expect(setTheme.mock.calls).toEqual([['dark'], ['system']]);
  });

  it('reverts to the saved theme when the only save fails', async () => {
    updateMe.mockRejectedValueOnce(new Error('boom'));
    renderPicker();

    fireEvent.click(screen.getByLabelText('settings.theme_dark'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(setTheme.mock.calls).toEqual([['dark'], ['light']]);
  });
});
