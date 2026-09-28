'use client';

// React side of the chunk highlight (the plugin is in chunkHighlight.ts).
//
// Owns the parts that need React: it reads the editor from the ref, registers the
// click handler, and keeps the open chunk in the active color.

import { useCallback, useEffect, useMemo } from 'react';

import {
  addChunkHighlight,
  getChunkRange,
  removeChunkHighlight,
  setChunkHighlightClickHandler,
  setChunkHighlightState,
} from './chunkHighlight';

import type { RichNoteEditorRef } from './RichNoteEditor';

type UseChunkHighlightsParams = {
  editorRef: React.RefObject<RichNoteEditorRef | null>;
  /** Chunk shown in the active color (the open diff), or null. */
  activeId: string | null;
  /** Called with the chunk id when the user clicks a highlight that has a result. Must be stable. */
  onClick: (id: string) => void;
};

export type ChunkHighlights = {
  /** Highlight `[from, to]` as pending. Returns false when the range is empty or overlaps another chunk. */
  add: (id: string, from: number, to: number) => boolean;
  /** The result is ready: the highlight becomes clickable. */
  markReady: (id: string) => void;
  remove: (id: string) => void;
  /** Current range of the chunk, or null when its text was deleted. */
  getRange: (id: string) => { from: number; to: number } | null;
};

export function useChunkHighlights({ editorRef, activeId, onClick }: UseChunkHighlightsParams): ChunkHighlights {
  const add = useCallback(
    (id: string, from: number, to: number): boolean => {
      const ed = editorRef.current?.editor;
      if (!ed || !addChunkHighlight(ed, id, from, to)) return false;
      // Set here, not in an effect: the editor is created after the first render.
      setChunkHighlightClickHandler(ed, onClick);
      return true;
    },
    [editorRef, onClick]
  );

  const markReady = useCallback(
    (id: string) => {
      const ed = editorRef.current?.editor;
      if (ed) setChunkHighlightState(ed, id, 'ready');
    },
    [editorRef]
  );

  const remove = useCallback(
    (id: string) => {
      const ed = editorRef.current?.editor;
      if (ed) removeChunkHighlight(ed, id);
    },
    [editorRef]
  );

  const getRange = useCallback(
    (id: string) => {
      const ed = editorRef.current?.editor;
      return ed ? getChunkRange(ed, id) : null;
    },
    [editorRef]
  );

  // Show the open chunk in the active color.
  useEffect(() => {
    const ed = editorRef.current?.editor;
    if (!ed || !activeId) return undefined;
    setChunkHighlightState(ed, activeId, 'active');
    // No-op when the highlight was removed (accept / reject).
    return () => setChunkHighlightState(ed, activeId, 'ready');
  }, [activeId, editorRef]);

  // Memoized: callers put the object in useCallback dependencies.
  return useMemo(() => ({ add, markReady, remove, getRange }), [add, markReady, remove, getRange]);
}
