'use client';

// Free space (px) between the right edge of the note column and the right edge of the scroll area.
// The outline rail sits in that space. It shrinks in full width mode on a narrow window, and when the
// diff panel is open, so the rail must hide when the space is too small.

import { useEffect, useState, type RefObject } from 'react';

import { findScrollParent } from './scroll';

import type { Editor } from '@tiptap/core';

export function useRailSpace(editor: Editor, containerRef: RefObject<HTMLElement | null>): number {
  const [space, setSpace] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scrollParent = findScrollParent(editor.view.dom);

    const measure = () => {
      // `clientWidth` has no scrollbar, so the rail is not placed under it.
      const areaRight = scrollParent
        ? scrollParent.getBoundingClientRect().left + scrollParent.clientLeft + scrollParent.clientWidth
        : document.documentElement.clientWidth;
      const next = Math.floor(areaRight - container.getBoundingClientRect().right);
      setSpace(previous => (previous === next ? previous : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    if (scrollParent) observer.observe(scrollParent);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [editor, containerRef]);

  return space;
}
