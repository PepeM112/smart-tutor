'use client';

// The heading list of the document and the heading that is active at the current scroll position.
//
// The list is read from the ProseMirror doc after a short quiet time, so typing does not rebuild it on
// each key. The active id is read from the heading elements of the DOM (they have the slug id from
// `headingAnchors.ts`), so it is always in step with what is on the screen.

import { useEffect, useState } from 'react';

import { collectHeadings, type OutlineHeading } from './headings';
import { findScrollParent, isRendered, queryHeadingElements } from './scroll';

import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';

const REBUILD_DELAY_MS = 150;
/** A heading is "current" once its top is above this distance from the top of the scroll area. */
const ACTIVE_OFFSET_PX = 96;
/** Distance from the bottom of the scroll area that counts as "at the end". */
const BOTTOM_TOLERANCE_PX = 2;

export type HeadingOutline = {
  headings: OutlineHeading[];
  activeId: string | null;
};

const sameHeadings = (a: OutlineHeading[], b: OutlineHeading[]): boolean =>
  a.length === b.length && a.every((h, i) => h.id === b[i].id && h.level === b[i].level && h.text === b[i].text);

/** Pure part of the active-heading rule: the last heading above the threshold, else the first one. */
export function pickActiveId(tops: readonly { id: string; top: number }[], threshold: number): string | null {
  if (tops.length === 0) return null;
  const passed = tops.filter(entry => entry.top <= threshold);
  return (passed.length > 0 ? passed[passed.length - 1] : tops[0]).id;
}

export function useHeadingOutline(editor: Editor): HeadingOutline {
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Heading list: now, and after each change of the document.
  useEffect(() => {
    let timer = 0;
    const rebuild = () => {
      if (editor.isDestroyed) return;
      const next = collectHeadings(editor.state.doc);
      setHeadings(previous => (sameHeadings(previous, next) ? previous : next));
    };
    // `transaction`, not `update`: loading a note with `emitUpdate: false` emits no `update`.
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(rebuild, REBUILD_DELAY_MS);
    };

    rebuild();
    editor.on('transaction', onTransaction);
    return () => {
      window.clearTimeout(timer);
      editor.off('transaction', onTransaction);
    };
  }, [editor]);

  // Active heading: from the scroll position of the scroll container.
  useEffect(() => {
    if (headings.length === 0) return;
    const dom = editor.view.dom;
    const scrollParent = findScrollParent(dom);
    const scrollTarget: HTMLElement | Window = scrollParent ?? window;
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const rootTop = scrollParent?.getBoundingClientRect().top ?? 0;
      const scroller = scrollParent ?? document.documentElement;
      const visible = queryHeadingElements(dom).filter(isRendered);
      const isAtEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - BOTTOM_TOLERANCE_PX;
      const canScroll = scroller.scrollHeight > scroller.clientHeight + BOTTOM_TOLERANCE_PX;

      const next =
        isAtEnd && canScroll && visible.length > 0
          ? visible[visible.length - 1].id
          : pickActiveId(
              visible.map(element => ({ id: element.id, top: element.getBoundingClientRect().top - rootTop })),
              ACTIVE_OFFSET_PX
            );
      setActiveId(previous => (previous === next ? previous : next));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    scrollTarget.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(dom);
    schedule();
    return () => {
      scrollTarget.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [editor, headings]);

  return { headings, activeId };
}
