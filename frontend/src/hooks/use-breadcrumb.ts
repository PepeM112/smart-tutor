'use client';

import { useLayoutEffect, useMemo } from 'react';

import { type BreadcrumbItem, useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export function useBreadcrumb(title: string, crumbs?: BreadcrumbItem[], back?: string) {
  const set = useBreadcrumbStore(s => s.set);
  const reset = useBreadcrumbStore(s => s.reset);

  // Compare by value, not reference — callers often pass a new array each render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableCrumbs = useMemo(() => crumbs, [JSON.stringify(crumbs)]);

  // Layout effect (not a passive effect) so the store update — and the Breadcrumb
  // header's re-render — commits before the browser paints. A plain useEffect runs
  // after paint, which is what caused the one-frame blank header on navigation.
  useLayoutEffect(() => {
    set(title, stableCrumbs, back);
    return () => reset();
  }, [set, reset, title, stableCrumbs, back]);
}
