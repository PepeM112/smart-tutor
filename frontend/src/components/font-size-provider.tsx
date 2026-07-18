'use client';

import { FontSizeContext, useFontSizeProvider } from '@/hooks/use-font-size';

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const value = useFontSizeProvider();
  return <FontSizeContext.Provider value={value}>{children}</FontSizeContext.Provider>;
}
