'use client';

import { useEffect, type ReactNode } from 'react';

import { useBreadcrumbStore } from '@/store/useBreadcrumbStore';

/**
 * Puts the page actions in the header: `PageHeader` from `lg`, `MobileHeader` below it. The actions go away
 * with the page. Memoize `actions` (or keep it stable): a new node on each render sets the store each time.
 */
export function usePageActions(actions: ReactNode | undefined): void {
  const setActions = useBreadcrumbStore(s => s.setActions);

  useEffect(() => {
    setActions(actions);
    return () => setActions(undefined);
  }, [actions, setActions]);
}

/**
 * Replaces the left side of the desktop header (back arrow, crumbs, title) with `lead`. The phone header keeps
 * the title and Back from `useBreadcrumb`. Memoize `lead`, as with `usePageActions`.
 * Pass `hasHeading` when `lead` renders the page h1: the header then adds no hidden one.
 */
export function usePageLead(lead: ReactNode | undefined, hasHeading = false): void {
  const setLead = useBreadcrumbStore(s => s.setLead);

  useEffect(() => {
    setLead(lead, hasHeading);
    return () => setLead(undefined);
  }, [lead, hasHeading, setLead]);
}
