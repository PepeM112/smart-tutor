'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { spaceIdFromRoute } from '@/lib/routes';

import { useAssist } from '../hooks/useAssist';
import { usePageContext } from '../hooks/usePageContext';

type AssistState = Pick<ReturnType<typeof useAssist>, 'turns' | 'isStreaming'>;
type AssistActions = Pick<ReturnType<typeof useAssist>, 'send' | 'stop' | 'confirm' | 'clear'>;

// Two contexts: `turns` changes on every streamed token. A component that only calls an action reads the
// actions context, whose value stays the same while tokens arrive, so it does not re-render.
const AssistStateContext = createContext<AssistState | null>(null);
const AssistActionsContext = createContext<AssistActions | null>(null);

export function AssistProvider({ children }: { children: ReactNode }) {
  const pageContext = usePageContext();
  const spaceId = spaceIdFromRoute(usePathname());
  const { turns, isStreaming, send, stop, confirm, clear } = useAssist(pageContext, spaceId);

  const state = useMemo(() => ({ turns, isStreaming }), [turns, isStreaming]);
  const actions = useMemo(() => ({ send, stop, confirm, clear }), [send, stop, confirm, clear]);

  return (
    <AssistActionsContext.Provider value={actions}>
      <AssistStateContext.Provider value={state}>{children}</AssistStateContext.Provider>
    </AssistActionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAssistState(): AssistState {
  const ctx = useContext(AssistStateContext);
  if (!ctx) throw new Error('useAssistState must be used within AssistProvider');
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAssistActions(): AssistActions {
  const ctx = useContext(AssistActionsContext);
  if (!ctx) throw new Error('useAssistActions must be used within AssistProvider');
  return ctx;
}
