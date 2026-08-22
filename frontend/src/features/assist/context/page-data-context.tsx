'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type PageDataContextValue = {
  contextData: string | null;
  setContextData: (data: string | null) => void;
};

const PageDataContext = createContext<PageDataContextValue>({
  contextData: null,
  setContextData: () => {},
});

export function PageDataProvider({ children }: { children: ReactNode }) {
  const [contextData, setContextData] = useState<string | null>(null);
  const value = useMemo(() => ({ contextData, setContextData }), [contextData]);
  return <PageDataContext.Provider value={value}>{children}</PageDataContext.Provider>;
}

export function usePageData() {
  return useContext(PageDataContext);
}
