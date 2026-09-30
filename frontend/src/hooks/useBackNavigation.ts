'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Returns a navigate-back function, like the browser Back button (same as Notion):
 * - `router.back()` when the tab has a previous history entry.
 * - `router.push(fallback)` when this page is the first entry (URL opened in a new tab).
 */
export function useBackNavigation(fallback: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [router, fallback]);
}
