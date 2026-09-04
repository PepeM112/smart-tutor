'use client';

import { useEffect, type ReactNode } from 'react';

import { useBreadcrumbStore } from '@/store/useBreadcrumbStore';

import { useBreakpoint } from './useBreakpoint';

export function useMobileBreadcrumbActions(actions: ReactNode | undefined) {
  const { isDesktop } = useBreakpoint();
  const setActions = useBreadcrumbStore(s => s.setActions);

  useEffect(() => {
    setActions(isDesktop ? undefined : actions);
    return () => setActions(undefined);
  }, [isDesktop, actions, setActions]);
}
