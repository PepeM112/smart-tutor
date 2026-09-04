'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

import { DEFAULT_THEME_ID, THEME_COOKIE, THEME_STORAGE_KEY, themes, type ThemeId } from '@/lib/themes';

interface ThemeContextValue {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  themeId: DEFAULT_THEME_ID,
  setTheme: () => {},
});

const DARK_DEFAULT: ThemeId = 'midnight';

function readStoredTheme(): ThemeId {
  // SAFETY: setTheme only writes valid ThemeId values; the .some() check below handles stale/tampered values
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
  if (stored && themes.some(t => t.id === stored)) return stored;
  // Must match the inline dark-mode check in app/layout.tsx — keep both in sync
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? DARK_DEFAULT : DEFAULT_THEME_ID;
}

const subscribers = new Set<() => void>();
let currentTheme: ThemeId | undefined;

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function getSnapshot(): ThemeId {
  currentTheme ??= readStoredTheme();
  return currentTheme;
}

function getServerSnapshot(): ThemeId {
  return DEFAULT_THEME_ID;
}

function setThemeCookie(id: ThemeId): void {
  const maxAge = 365 * 24 * 60 * 60;
  const value = id === DEFAULT_THEME_ID ? '' : id;
  document.cookie = `${THEME_COOKIE}=${value};path=/;max-age=${value ? maxAge : 0};SameSite=Lax`;
}

export function useThemeProvider(): ThemeContextValue {
  const themeId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((id: ThemeId) => {
    if (!themes.some(t => t.id === id)) return;

    currentTheme = id;
    localStorage.setItem(THEME_STORAGE_KEY, id);
    // Cookie lets layout.tsx set the theme server-side before hydration, preventing a flash
    setThemeCookie(id);

    const root = document.documentElement;
    if (id === DEFAULT_THEME_ID) {
      root.removeAttribute('data-theme');
    } else {
      root.dataset.theme = id;
    }

    subscribers.forEach(cb => cb());
  }, []);

  return { themeId, setTheme };
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
