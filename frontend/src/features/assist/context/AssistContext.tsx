'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useAssist } from '../hooks/useAssist';
import { usePageContext } from '../hooks/usePageContext';

type AssistContextValue = ReturnType<typeof useAssist>;

const AssistContext = createContext<AssistContextValue | null>(null);

export function AssistProvider({ children }: { children: ReactNode }) {
  const pageContext = usePageContext();
  const assist = useAssist(pageContext);

  return <AssistContext.Provider value={assist}>{children}</AssistContext.Provider>;
}

export function useAssistContext(): AssistContextValue {
  const ctx = useContext(AssistContext);
  if (!ctx) throw new Error('useAssistContext must be used within AssistProvider');
  return ctx;
}
