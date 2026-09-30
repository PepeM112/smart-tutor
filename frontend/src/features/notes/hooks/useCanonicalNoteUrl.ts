'use client';

import { useEffect } from 'react';

import { noteHref } from '@/lib/routes';

const CANONICAL_URL_DEBOUNCE_MS = 500;

/**
 * Keeps the address bar on `/notes/{slug}-{id}` while the title changes.
 * `history.replaceState` changes only the address bar. A router navigation to a new
 * [id] param value could remount the page and the editor.
 * Debounced: Safari throws after 100 history calls in 10 s (e.g. Backspace held in the title).
 * The query string and the hash stay.
 * State `null`: Next syncs `usePathname` only for a state that is not its own (`__NA`).
 */
export function useCanonicalNoteUrl(noteId: string, title: string): void {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canonical = noteHref({ id: noteId, title });
      if (window.location.pathname !== canonical) {
        window.history.replaceState(null, '', canonical + window.location.search + window.location.hash);
      }
    }, CANONICAL_URL_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [noteId, title]);
}
