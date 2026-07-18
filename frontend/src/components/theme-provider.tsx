'use client';

import { ThemeContext, useThemeProvider } from '@/hooks/use-theme';

import type { ReactNode } from 'react';


export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeProvider();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
