'use client';

// Width of the note text column: the 720px reading column, or the full page width.
// One setting per viewer for all notes, stored in localStorage. Storage can throw
// (private mode, blocked site data), so reads and writes fall back to the default.

import { useCallback, useSyncExternalStore } from 'react';

export type NoteWidth = 'reading' | 'full';

const STORAGE_KEY = 'note-width';
const DEFAULT_WIDTH: NoteWidth = 'reading';

const subscribers = new Set<() => void>();
let current: NoteWidth | undefined;

function readStored(): NoteWidth {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'full' ? 'full' : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function getSnapshot(): NoteWidth {
  current ??= readStored();
  return current;
}

function getServerSnapshot(): NoteWidth {
  return DEFAULT_WIDTH;
}

export function useNoteWidth(): { width: NoteWidth; toggleWidth: () => void } {
  const width = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleWidth = useCallback(() => {
    current = getSnapshot() === 'full' ? 'reading' : 'full';
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch {
      // The toggle still works for this page view.
    }
    subscribers.forEach(cb => cb());
  }, []);

  return { width, toggleWidth };
}
