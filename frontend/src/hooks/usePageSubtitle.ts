'use client';

import { useEffect } from 'react';

import { useBreadcrumbStore } from '@/store/useBreadcrumbStore';

/** Puts a line under the title of the phone header. It goes away with the page. */
export function usePageSubtitle(subtitle: string | undefined): void {
  const setSubtitle = useBreadcrumbStore(s => s.setSubtitle);

  useEffect(() => {
    setSubtitle(subtitle);
    return () => setSubtitle(undefined);
  }, [subtitle, setSubtitle]);
}
