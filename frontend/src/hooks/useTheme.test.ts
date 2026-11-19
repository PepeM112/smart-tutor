// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_COOKIE, THEME_STORAGE_KEY } from '@/lib/themes';

import type { useThemeProvider as UseThemeProvider } from './useTheme';

/** A matchMedia stand-in that tests can flip, like the OS switching between light and dark. */
function mockOsTheme(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    listenerCount: () => listeners.size,
    switchTo: (dark: boolean) => {
      matches = dark;
      listeners.forEach(listener => listener());
    },
  };
}

const dataTheme = () => document.documentElement.dataset.theme;

// The hook keeps the current theme in a module variable, so each test imports a fresh copy.
async function loadHook(): Promise<typeof UseThemeProvider> {
  vi.resetModules();
  return (await import('./useTheme')).useThemeProvider;
}

beforeEach(() => {
  localStorage.clear();
  document.cookie = `${THEME_COOKIE}=;path=/;max-age=0`;
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useTheme', () => {
  it('starts in system mode with nothing stored', async () => {
    mockOsTheme(false);
    const useThemeProvider = await loadHook();
    const { result } = renderHook(() => useThemeProvider());
    expect(result.current.theme).toBe('system');
  });

  it('maps an old stored palette id to its mode', async () => {
    mockOsTheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'midnight');
    const useThemeProvider = await loadHook();
    const { result } = renderHook(() => useThemeProvider());
    expect(result.current.theme).toBe('dark');
  });

  it('saves the mode in storage and cookie and sets data-theme', async () => {
    mockOsTheme(false);
    const useThemeProvider = await loadHook();
    const { result } = renderHook(() => useThemeProvider());

    act(() => result.current.setTheme('dark'));

    expect(result.current.theme).toBe('dark');
    expect(dataTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  });

  it('follows the OS when it changes in system mode, with no reload', async () => {
    const os = mockOsTheme(false);
    const useThemeProvider = await loadHook();
    const { result } = renderHook(() => useThemeProvider());

    act(() => result.current.setTheme('system'));
    expect(dataTheme()).toBe('light');

    act(() => os.switchTo(true));
    expect(dataTheme()).toBe('dark');

    act(() => os.switchTo(false));
    expect(dataTheme()).toBe('light');
  });

  it('ignores the OS in an explicit mode', async () => {
    const os = mockOsTheme(false);
    const useThemeProvider = await loadHook();
    const { result } = renderHook(() => useThemeProvider());

    act(() => result.current.setTheme('light'));
    act(() => os.switchTo(true));

    expect(dataTheme()).toBe('light');
    expect(os.listenerCount()).toBe(0);
  });

  it('stops listening to the OS when the mode leaves system', async () => {
    const os = mockOsTheme(false);
    const useThemeProvider = await loadHook();
    const { result } = renderHook(() => useThemeProvider());

    act(() => result.current.setTheme('system'));
    expect(os.listenerCount()).toBe(1);

    act(() => result.current.setTheme('dark'));
    expect(os.listenerCount()).toBe(0);
  });
});
