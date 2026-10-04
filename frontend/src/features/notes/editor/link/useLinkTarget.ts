'use client';

// Which link the popover is about: the link under the pointer (after a short delay), else the link that
// holds the cursor. Touch has no hover, so on touch a tap puts the cursor in the link and that shows it.
//
// The target has a document range, so edit / remove act on the whole link even when the cursor is
// elsewhere (hover). While a menu action is in progress the caller can `hold` the target: it then stays
// until `release`, even if the pointer or the cursor leaves.
//
// Nothing here is saved. The position is measured from the DOM (one `requestAnimationFrame` per frame).

import { getMarkRange } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { Editor } from '@tiptap/core';

export type LinkTarget = {
  href: string;
  from: number;
  to: number;
  /** Rect of the link relative to the container (px). */
  left: number;
  bottom: number;
};

/** Delay before a hovered link shows its popover, and before it hides after the pointer leaves. */
const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 250;

type Hovered = { anchor: HTMLAnchorElement };

export type LinkTargetState = {
  target: LinkTarget | null;
  /** Keep the current target while the user edits it. */
  hold: () => void;
  release: () => void;
  /** Hide the popover until the cursor or the pointer goes to another link. */
  dismiss: () => void;
  /** Pointer is over the popover: do not hide it. */
  pointerEnterPopover: () => void;
  pointerLeavePopover: () => void;
};

export function useLinkTarget(editor: Editor, containerRef: RefObject<HTMLElement | null>): LinkTargetState {
  const [target, setTarget] = useState<LinkTarget | null>(null);
  const hovered = useRef<Hovered | null>(null);
  const held = useRef<LinkTarget | null>(null);
  const latest = useRef<LinkTarget | null>(null);
  const dismissedKey = useRef<string | null>(null);
  const lastKey = useRef('');
  const frame = useRef(0);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const overPopover = useRef(false);

  const measure = useCallback(() => {
    frame.current = 0;
    const container = containerRef.current;
    let next: LinkTarget | null = null;
    if (container && !editor.isDestroyed && editor.isEditable) {
      if (held.current) {
        next = remeasure(editor, container, held.current);
      } else {
        const raw = computeTarget(editor, container, hovered.current);
        // A dismiss only holds while the same link stays the target.
        if (!raw || (dismissedKey.current !== null && dismissedKey.current !== rangeKey(raw))) {
          dismissedKey.current = null;
        }
        next = raw && dismissedKey.current === rangeKey(raw) ? null : raw;
      }
    }
    const key = JSON.stringify(next);
    if (key === lastKey.current) return;
    lastKey.current = key;
    latest.current = next;
    setTarget(next);
  }, [editor, containerRef]);

  const schedule = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  const hold = useCallback(() => {
    held.current = latest.current;
  }, []);

  const release = useCallback(() => {
    held.current = null;
    schedule();
  }, [schedule]);

  const dismiss = useCallback(() => {
    const current = latest.current;
    dismissedKey.current = current ? rangeKey(current) : null;
    hovered.current = null;
    held.current = null;
    schedule();
  }, [schedule]);

  const pointerEnterPopover = useCallback(() => {
    overPopover.current = true;
    window.clearTimeout(closeTimer.current);
  }, []);

  const pointerLeavePopover = useCallback(() => {
    overPopover.current = false;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      hovered.current = null;
      schedule();
    }, HOVER_CLOSE_MS);
  }, [schedule]);

  useEffect(() => {
    const dom = editor.view.dom;

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const anchor = (event.target as HTMLElement | null)?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || !dom.contains(anchor)) return;
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(openTimer.current);
      if (hovered.current?.anchor === anchor) return;
      openTimer.current = window.setTimeout(() => {
        hovered.current = { anchor };
        schedule();
      }, HOVER_OPEN_MS);
    };
    const onPointerOut = (event: PointerEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a[href]');
      if (!anchor) return;
      // Moving inside the same link (text → inline code) is not a leave.
      const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest('a[href]') : null;
      if (to === anchor) return;
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => {
        if (overPopover.current) return;
        hovered.current = null;
        schedule();
      }, HOVER_CLOSE_MS);
    };

    dom.addEventListener('pointerover', onPointerOver);
    dom.addEventListener('pointerout', onPointerOut);
    editor.on('transaction', schedule);
    editor.on('focus', schedule);
    editor.on('blur', schedule);
    window.addEventListener('resize', schedule);
    const container = containerRef.current;
    container?.addEventListener('scroll', schedule, true);
    const observer = container ? new ResizeObserver(schedule) : null;
    if (container) observer?.observe(container);
    schedule();

    return () => {
      dom.removeEventListener('pointerover', onPointerOver);
      dom.removeEventListener('pointerout', onPointerOut);
      editor.off('transaction', schedule);
      editor.off('focus', schedule);
      editor.off('blur', schedule);
      window.removeEventListener('resize', schedule);
      container?.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    };
  }, [editor, containerRef, schedule]);

  return { target, hold, release, dismiss, pointerEnterPopover, pointerLeavePopover };
}

const rangeKey = (target: LinkTarget): string => `${target.from}:${target.to}`;

// ─── measuring ───────────────────────────────────────────────────────────────

function computeTarget(editor: Editor, container: HTMLElement, hovered: Hovered | null): LinkTarget | null {
  const { view, state } = editor;
  // A text selection has the bubble menu: the popover stays out of its way.
  if (!state.selection.empty) return null;

  const box = container.getBoundingClientRect();
  if (hovered && view.dom.contains(hovered.anchor)) {
    const from = view.posAtDOM(hovered.anchor, 0);
    const to = view.posAtDOM(hovered.anchor, hovered.anchor.childNodes.length);
    return fromAnchor(hovered.anchor, from, to, box);
  }

  const linkType = state.schema.marks.link;
  // `marks()` skips a link at its edges (the mark is not inclusive), so typing after a link does not open it.
  if (!linkType || !editor.isFocused || !linkType.isInSet(state.selection.$from.marks())) return null;
  const range = getMarkRange(state.selection.$from, linkType);
  if (!range) return null;
  const { node } = view.domAtPos(range.from + 1);
  const anchor = (node instanceof Element ? node : node.parentElement)?.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? fromAnchor(anchor, range.from, range.to, box) : null;
}

/** A held target keeps its range (mapped by the editor), only the position is measured again. */
function remeasure(editor: Editor, container: HTMLElement, held: LinkTarget): LinkTarget | null {
  const { view } = editor;
  const { node } = view.domAtPos(Math.min(held.from + 1, view.state.doc.content.size));
  const anchor = (node instanceof Element ? node : node.parentElement)?.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return held;
  const box = container.getBoundingClientRect();
  return { ...fromAnchor(anchor, held.from, held.to, box), href: held.href };
}

function fromAnchor(anchor: HTMLAnchorElement, from: number, to: number, box: DOMRect): LinkTarget {
  const rect = anchor.getBoundingClientRect();
  return {
    href: anchor.getAttribute('href') ?? '',
    from,
    to,
    left: Math.round(rect.left - box.left),
    bottom: Math.round(rect.bottom - box.top),
  };
}
