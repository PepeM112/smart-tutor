'use client';

import { FontSizeContext, useFontSizeProvider } from '@/hooks/useFontSize';

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const value = useFontSizeProvider();
  return <FontSizeContext.Provider value={value}>{children}</FontSizeContext.Provider>;
}
