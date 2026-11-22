// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiEffort, type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { clearUnconfirmedChanges, getUnconfirmed } from './unconfirmedUserChanges';
import { SAVE_DELAY_MS, useDebouncedUpdateUser } from './useDebouncedUpdateUser';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({ sdk: { usersUpdateMe: vi.fn() } }));

const updateMe = vi.mocked(sdk.usersUpdateMe);
const START_USER = { id: 'u1', theme: 'light', timeFormat: '24h', timezone: null } as UserRead;
const reply = (fields: Partial<UserRead>) => ({ data: { ...START_USER, ...fields } }) as never;
const sentBodies = (): unknown[] => updateMe.mock.calls.map(([options]) => options.body);

function renderSaver() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useDebouncedUpdateUser(), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });
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

describe('useDebouncedUpdateUser', () => {
  it('shows a change at once and sends no request before the delay ends', async () => {
    const { result } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    await advance(SAVE_DELAY_MS - 1);

    expect(useAuthStore.getState().user?.theme).toBe('dark');
    expect(updateMe).not.toHaveBeenCalled();
  });

  it('sends one request with the last value after three quick changes', async () => {
    updateMe.mockResolvedValue(reply({ theme: 'light-ink' }));
    const { result } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    await advance(500);
    act(() => result.current({ theme: 'system' }, { field: 'theme' }));
    await advance(500);
    act(() => result.current({ theme: 'light-ink' }, { field: 'theme' }));
    await advance(SAVE_DELAY_MS);

    expect(sentBodies()).toEqual([{ theme: 'light-ink' }]);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('keeps one request per field', async () => {
    updateMe.mockResolvedValue(reply({}));
    const { result } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    act(() => result.current({ timeFormat: '12h' }, { field: 'timeFormat' }));
    await advance(SAVE_DELAY_MS);

    expect(sentBodies()).toEqual([{ theme: 'dark' }, { timeFormat: '12h' }]);
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it('sends the waiting change when the component unmounts', async () => {
    updateMe.mockResolvedValue(reply({ theme: 'dark' }));
    const { result, unmount } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    unmount();
    await advance(0);

    expect(sentBodies()).toEqual([{ theme: 'dark' }]);
    await advance(SAVE_DELAY_MS);
    expect(updateMe).toHaveBeenCalledTimes(1);
  });

  it('sends the waiting change with keepalive when the page is hidden', async () => {
    updateMe.mockResolvedValue(reply({ theme: 'dark' }));
    const { result } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await advance(SAVE_DELAY_MS);

    expect(updateMe.mock.calls).toEqual([[{ body: { theme: 'dark' }, keepalive: true }]]);
  });

  it('keeps the change tracked until the pagehide request settles', async () => {
    let settle: (value: never) => void = () => undefined;
    updateMe.mockImplementationOnce(() => new Promise(resolve => (settle = resolve)) as never);
    const { result } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(getUnconfirmed('theme')?.body).toEqual({ theme: 'dark' });

    settle(reply({ theme: 'dark' }));
    await advance(0);
    expect(getUnconfirmed('theme')).toBeUndefined();
  });

  it('does not let a late response put an older value back', async () => {
    let resolveFirst: (value: never) => void = () => undefined;
    updateMe.mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)) as never);
    updateMe.mockResolvedValueOnce(reply({ theme: 'light-ink' }));
    const { result } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    await advance(SAVE_DELAY_MS);
    // The first request is still in flight when the user picks again.
    act(() => result.current({ theme: 'light-ink' }, { field: 'theme' }));
    resolveFirst(reply({ theme: 'dark' }));
    await advance(0);

    expect(useAuthStore.getState().user?.theme).toBe('light-ink');

    await advance(SAVE_DELAY_MS);
    expect(sentBodies()).toEqual([{ theme: 'dark' }, { theme: 'light-ink' }]);
    expect(useAuthStore.getState().user?.theme).toBe('light-ink');
  });

  it('does not let the response of another field put an older value back', async () => {
    let resolveSlow: (value: never) => void = () => undefined;
    updateMe.mockImplementationOnce(() => new Promise(resolve => (resolveSlow = resolve)) as never);
    const { result } = renderSaver();

    act(() => result.current({ timeFormat: '12h' }, { field: 'timeFormat' }));
    await advance(SAVE_DELAY_MS);
    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    // The answer to the time format was built before the theme change, so it has the old theme.
    resolveSlow(reply({ timeFormat: '12h', theme: 'light' }));
    await advance(0);

    expect(useAuthStore.getState().user).toMatchObject({ timeFormat: '12h', theme: 'dark' });
  });

  it('puts the old value back and calls `show` when the save fails', async () => {
    updateMe.mockRejectedValueOnce(new Error('boom'));
    const show = vi.fn();
    const { result } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme', show }));
    await advance(SAVE_DELAY_MS);

    expect(useAuthStore.getState().user?.theme).toBe('light');
    expect(show.mock.calls).toEqual([[{ theme: 'dark' }], [{ theme: 'light' }]]);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer change when an older save fails', async () => {
    let rejectFirst: (error: Error) => void = () => undefined;
    updateMe.mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectFirst = reject)) as never);
    updateMe.mockResolvedValueOnce(reply({ theme: 'light-ink' }));
    const { result } = renderSaver();

    act(() => result.current({ theme: 'dark' }, { field: 'theme' }));
    await advance(SAVE_DELAY_MS);
    act(() => result.current({ theme: 'light-ink' }, { field: 'theme' }));
    rejectFirst(new Error('boom'));
    await advance(0);

    expect(useAuthStore.getState().user?.theme).toBe('light-ink');
    await advance(SAVE_DELAY_MS);
    expect(sentBodies()).toEqual([{ theme: 'dark' }, { theme: 'light-ink' }]);
  });

  it('merges the effort of separate actions into separate fields', async () => {
    updateMe.mockResolvedValue(reply({}));
    useAuthStore.setState({
      user: {
        ...START_USER,
        aiEffort: { grading: AiEffort.MEDIUM, challenge: AiEffort.MEDIUM },
      } as unknown as UserRead,
    });
    const { result } = renderSaver();

    act(() => result.current({ aiEffort: { grading: AiEffort.LOW } }, { field: 'aiEffort.grading' }));
    act(() => result.current({ aiEffort: { challenge: AiEffort.HIGH } }, { field: 'aiEffort.challenge' }));
    await advance(SAVE_DELAY_MS);

    expect(sentBodies()).toEqual([{ aiEffort: { grading: AiEffort.LOW } }, { aiEffort: { challenge: AiEffort.HIGH } }]);
  });
});
