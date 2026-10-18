'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, type ReactNode } from 'react';

import { spaceIdFromRoute } from '@/lib/routes';

import { useAssist } from '../hooks/useAssist';
import { usePageContext } from '../hooks/usePageContext';

type AssistContextValue = ReturnType<typeof useAssist>;

const AssistContext = createContext<AssistContextValue | null>(null);

export function AssistProvider({ children }: { children: ReactNode }) {
  const pageContext = usePageContext();
  const spaceId = spaceIdFromRoute(usePathname());
  const assist = useAssist(pageContext, spaceId);

  return <AssistContext.Provider value={assist}>{children}</AssistContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAssistContext(): AssistContextValue {
  const ctx = useContext(AssistContext);
  if (!ctx) throw new Error('useAssistContext must be used within AssistProvider');
  return ctx;
}
