'use client';

import { useEffect, useMemo } from 'react';

import { type BreadcrumbItem, useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export function useBreadcrumb(title: string, crumbs?: BreadcrumbItem[], back?: string) {
  const set = useBreadcrumbStore(s => s.set);
  const reset = useBreadcrumbStore(s => s.reset);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableCrumbs = useMemo(() => crumbs, [JSON.stringify(crumbs)]);

  useEffect(() => {
    set(title, stableCrumbs, back);
    return () => reset();
  }, [set, reset, title, stableCrumbs, back]);
}
