'use client';

import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/store/authStore';
import { ThemeContext, useThemeProvider } from '@/hooks/useTheme';
import { parseTheme } from '@/lib/themes';

import type { ReactNode } from 'react';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeProvider();
  const { setTheme } = value;
  const userTheme = useAuthStore(s => s.user?.theme);

  // The saved user theme wins on login, on /me and in another tab: the backend is the source of truth.
  useEffect(() => {
    if (userTheme) setTheme(parseTheme(userTheme));
  }, [userTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
