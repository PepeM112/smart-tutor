'use client';

// Places the outline rail and measures the free space for it.
//
// The rail is a `position: fixed` layer (in a portal), not a child of the note column. So it does not
// scroll with the note and does not follow the column when it changes between reading and full width.
// This hook sets its `top`, `right` and `max-height` from the scroll area of the note, so the rail
// stays at one spot: a fixed distance from the top and from the right edge of that area. The scroll
// area is the pane of the split view, not the window, so an open diff panel or the docked assistant
// panel (they change the pane width) move the rail with the pane. The style is written straight to the
// element in a callback ref and a ResizeObserver callback, so the rail is never one frame behind.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { findScrollParent } from './scroll';

import type { Editor } from '@tiptap/core';

/** Distance (px) from the top of the scroll area to the top of the rail. */
export const RAIL_TOP = 96;
/** Distance (px) from the right edge of the scroll area (without its scrollbar) to the rail. */
export const RAIL_INSET = 4;
/** Distance (px) kept free below the rail. */
const RAIL_BOTTOM = 24;
/** Width (px) of the rail. It is also the hit area, so it is wide on purpose. */
export const RAIL_WIDTH = 40;
/** Least gap (px) between the text and the rail. */
const TEXT_GAP = 8;
/**
 * Least free space (px) between the right edge of the text and the right edge of the scroll area.
 * Less than this and the rail would touch the text, so it is hidden. The text of a full width note has
 * its own padding on the right, so this rarely hides the rail there. A narrow window can.
 */
export const MIN_RAIL_SPACE = RAIL_INSET + RAIL_WIDTH + TEXT_GAP;

type Area = { top: number; right: number; height: number };

/** Visible box of a scroll element: inside its borders, without the scrollbar. */
function areaOf(element: HTMLElement | null): Area {
  if (!element) return { top: 0, right: document.documentElement.clientWidth, height: window.innerHeight };
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + element.clientTop,
    right: rect.left + element.clientLeft + element.clientWidth,
    height: element.clientHeight,
  };
}

export type RailPlacement = {
  /** Free space (px) right of the text. */
  space: number;
  /** Callback ref for the rail layer. It is placed when it mounts, and on each change of the sizes. */
  layerRef: (element: HTMLElement | null) => void;
};

export function useRailPlacement(editor: Editor, containerRef: RefObject<HTMLElement | null>): RailPlacement {
  const [space, setSpace] = useState(0);
  const layer = useRef<HTMLElement | null>(null);

  const measure = useCallback((): void => {
    const container = containerRef.current;
    if (!container) return;
    const area = areaOf(findScrollParent(editor.view.dom));
    const next = Math.floor(area.right - container.getBoundingClientRect().right);
    setSpace(previous => (previous === next ? previous : next));
    const element = layer.current;
    if (!element) return;
    element.style.top = `${area.top + RAIL_TOP}px`;
    element.style.right = `${document.documentElement.clientWidth - area.right + RAIL_INSET}px`;
    element.style.maxHeight = `${Math.max(0, area.height - RAIL_TOP - RAIL_BOTTOM)}px`;
  }, [editor, containerRef]);

  // The rail mounts only when there is space for it, so it must be placed when it mounts. A callback
  // ref runs before paint, so the rail is never seen at a wrong place.
  const layerRef = useCallback(
    (element: HTMLElement | null): void => {
      layer.current = element;
      if (element) measure();
    },
    [measure]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scrollParent = findScrollParent(editor.view.dom);

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    if (scrollParent) observer.observe(scrollParent);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [editor, containerRef, measure]);

  return { space, layerRef };
}
