'use client';

// `/notes/{id}#slug` scrolls to the heading with that slug: once when the content is in the editor,
// and again when only the hash changes (an edit of the address bar).

import { useEffect } from 'react';

import { readHashId, scrollToHeading } from './scroll';

import type { Editor } from '@tiptap/core';

/** Frames to wait for the loaded content to render before the first scroll. */
const MAX_WAIT_FRAMES = 30;

export function useScrollToHash(editor: Editor): void {
  useEffect(() => {
    let frame = 0;
    let frames = 0;

    // The note content is set right after the editor is created. Try on each frame until the heading
    // exists (or give up). The scroll is instant: this is the page load, not a user action.
    const scrollWhenReady = () => {
      frame = 0;
      const id = readHashId();
      if (!id || editor.isDestroyed) return;
      if (scrollToHeading(editor.view.dom, id, 'auto')) return;
      frames += 1;
      if (frames < MAX_WAIT_FRAMES) frame = requestAnimationFrame(scrollWhenReady);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frames = 0;
      frame = requestAnimationFrame(scrollWhenReady);
    };

    start();
    window.addEventListener('hashchange', start);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', start);
    };
  }, [editor]);
}
