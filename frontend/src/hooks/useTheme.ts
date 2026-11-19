'use client';

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';

import {
  DARK_QUERY,
  DEFAULT_THEME_MODE,
  parseTheme,
  resolveTheme,
  THEME_COOKIE,
  THEME_MODES,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from '@/lib/themes';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME_MODE,
  setTheme: () => {},
});

function readStoredTheme(): ThemeMode {
  try {
    // parseTheme also maps an old palette id, so a user from before the light/dark change keeps their look.
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

const subscribers = new Set<() => void>();
let currentTheme: ThemeMode | undefined;

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function getSnapshot(): ThemeMode {
  currentTheme ??= readStoredTheme();
  return currentTheme;
}

function getServerSnapshot(): ThemeMode {
  return DEFAULT_THEME_MODE;
}

function setThemeCookie(mode: ThemeMode): void {
  const maxAge = 365 * 24 * 60 * 60;
  const value = mode === DEFAULT_THEME_MODE ? '' : mode;
  document.cookie = `${THEME_COOKIE}=${value};path=/;max-age=${value ? maxAge : 0};SameSite=Lax`;
}

// Only `setTheme` and the OS listener write the DOM. No effect writes it on hydration, because that first
// pass has the server value and would flash the wrong theme. `ThemeProvider` calls `setTheme` when `user.theme` changes.
function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolveTheme(mode, window.matchMedia(DARK_QUERY).matches);
}

export function useThemeProvider(): ThemeContextValue {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((mode: ThemeMode) => {
    if (!THEME_MODES.includes(mode)) return;

    currentTheme = mode;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Storage can be blocked (private window). The cookie and the page still change.
    }
    // Cookie lets layout.tsx set the theme server-side before hydration, preventing a flash
    setThemeCookie(mode);
    applyTheme(mode);

    subscribers.forEach(cb => cb());
  }, []);

  // In `system` mode the page follows the OS. An explicit mode ignores it.
  useEffect(() => {
    if (theme !== 'system') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (): void => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  return { theme, setTheme };
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
