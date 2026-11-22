'use client';

// Width of a text column: the 720px reading column, or the full page width.
// One setting per viewer and per key, stored in localStorage. Storage can throw
// (private mode, blocked site data), so reads and writes fall back to the default.

import { useCallback, useSyncExternalStore } from 'react';

export type NoteWidth = 'reading' | 'full';

type WidthStore = () => { width: NoteWidth; toggleWidth: () => void };

// A store per key, so the note width and the test editor width do not change each other.
// The default is a parameter: the test editor was full width before it got the toggle.
export function createWidthStore(storageKey: string, defaultWidth: NoteWidth): WidthStore {
  const subscribers = new Set<() => void>();
  let current: NoteWidth | undefined;

  const readStored = (): NoteWidth => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === 'full' || stored === 'reading' ? stored : defaultWidth;
    } catch {
      return defaultWidth;
    }
  };

  const subscribe = (cb: () => void): (() => void) => {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  };

  const getSnapshot = (): NoteWidth => {
    current ??= readStored();
    return current;
  };

  const getServerSnapshot = (): NoteWidth => defaultWidth;

  return function useWidth() {
    const width = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const toggleWidth = useCallback(() => {
      current = getSnapshot() === 'full' ? 'reading' : 'full';
      try {
        localStorage.setItem(storageKey, current);
      } catch {
        // The toggle still works for this page view.
      }
      subscribers.forEach(cb => cb());
    }, []);

    return { width, toggleWidth };
  };
}

export const useNoteWidth = createWidthStore('note-width', 'reading');
export const useTestWidth = createWidthStore('test-width', 'full');
