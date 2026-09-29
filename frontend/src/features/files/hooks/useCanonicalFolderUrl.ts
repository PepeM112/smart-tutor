'use client';

import { useEffect } from 'react';

import { folderHref } from '@/lib/routes';

/**
 * Keeps the address bar on `/files/{slug}-{id}` when the folder is renamed.
 * `history.replaceState` changes only the address bar (cheap, no navigation).
 *
 * @param folder The loaded folder, or null while it is unknown.
 * @param segment The current URL segment (`{slug}-{id}` or a bare id).
 */
export function useCanonicalFolderUrl(folder: { id: string; name: string } | null, segment: string): void {
  useEffect(() => {
    if (!folder) return;
    const canonical = folderHref(folder).replace('/files/', '');
    if (segment !== canonical) {
      window.history.replaceState(null, '', folderHref(folder));
    }
  }, [folder, segment]);
}
