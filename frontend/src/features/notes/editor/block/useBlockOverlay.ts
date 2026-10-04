'use client';

// State of the block handle: which top-level block is active and where its handle goes.
//
// The active block is the one under the pointer (or in the strip left of it, where the handle is), else none:
// the handle needs a pointer, so on touch it never shows. Same design as `table/useTableOverlay.ts`:
// - the pointer is tracked on the window, because the handle is left of the editor, outside the container,
// - all measuring runs in `requestAnimationFrame`, at most once per frame,
// - `lock` freezes the active block while a menu is open, a drag runs, or the pointer is on the handle.
//   The lock holds a document position and follows the document changes.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { blockIndexAt, BLOCK_HANDLE_REACH, boxesToBands, measureBlocks } from './blockGeometry';

import type { Band } from '../table/tableGeometry';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';

export type BlockState = {
  /** Position of the block node in the document. */
  pos: number;
  /** The block is a table: it has its own handle, so the block handle makes room for it. */
  isTable: boolean;
  /** Left edge of the block, relative to the container. */
  left: number;
  /** Left edge of the block in the viewport. */
  viewportLeft: number;
  /** Vertical center of the first line, relative to the container. */
  centerY: number;
};

/** `owner` is the control that took the lock. Only that control can release it. */
type Lock = { owner: string; pos: number };

export type BlockOverlay = {
  state: BlockState | null;
  /** Fresh bands of all top-level blocks, for a drag. Read at event time, so it is always current. */
  getBands: () => Band[];
  /** Freeze the active block. A new lock replaces the lock of another control, except with `ifFree`. */
  lock: (owner: string, options?: { ifFree?: boolean }) => void;
  /** Release the lock, but only when `owner` holds it. */
  unlock: (owner: string) => void;
};

/** Vertical center of the first line of text in the block, or `null` (no text, or the view is updating). */
function firstLineCenter(editor: Editor, pos: number): number | null {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return null;
  const textPos = (() => {
    if (node.isTextblock) return pos + 1;
    const found: number[] = [];
    node.descendants((child, offset) => {
      if (found.length > 0) return false;
      if (child.isTextblock) found.push(pos + 1 + offset + 1);
      return !child.isTextblock;
    });
    return found[0] ?? null;
  })();
  if (textPos === null) return null;
  try {
    const coords = editor.view.coordsAtPos(textPos);
    return (coords.top + coords.bottom) / 2;
  } catch {
    return null;
  }
}

function computeState(
  editor: Editor,
  container: HTMLElement,
  pointer: { x: number; y: number } | null,
  lock: Lock | null
): BlockState | null {
  if (editor.isDestroyed || (!pointer && !lock)) return null;
  const box = container.getBoundingClientRect();
  const boxes = measureBlocks(editor.view, box);
  if (boxes.length === 0) return null;

  const hovered = pointer ? blockIndexAt(boxesToBands(boxes), pointer.y - box.top) : null;
  const active = lock ? boxes.find(b => b.pos === lock.pos) : hovered === null ? undefined : boxes[hovered];
  if (!active) return null;

  const node = editor.state.doc.nodeAt(active.pos);
  const center = firstLineCenter(editor, active.pos);
  return {
    pos: active.pos,
    isTable: node?.type.name === 'table',
    left: active.left,
    viewportLeft: active.viewportLeft,
    // No text to measure (a divider, an empty table): use the middle of the block, at most one line down.
    centerY: center !== null ? center - box.top : active.top + Math.min(active.height / 2, 14),
  };
}

export function useBlockOverlay(editor: Editor, containerRef: RefObject<HTMLElement | null>): BlockOverlay {
  const [state, setState] = useState<BlockState | null>(null);

  const pointer = useRef<{ x: number; y: number } | null>(null);
  const lockRef = useRef<Lock | null>(null);
  const latest = useRef<BlockState | null>(null);
  const lastKey = useRef('');
  const frame = useRef(0);

  const measure = useCallback(() => {
    frame.current = 0;
    const container = containerRef.current;
    let next = container ? computeState(editor, container, pointer.current, lockRef.current) : null;
    // Safety net: the locked block is gone (deleted). A lock with no block hides the handle for good, and the
    // control that took the lock may be unmounted, so it never unlocks.
    if (container && !next && lockRef.current) {
      lockRef.current = null;
      next = computeState(editor, container, pointer.current, null);
    }
    const key = JSON.stringify(next);
    if (key === lastKey.current) return;
    lastKey.current = key;
    latest.current = next;
    setState(next);
  }, [editor, containerRef]);

  const schedule = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  const lock = useCallback((owner: string, options?: { ifFree?: boolean }) => {
    if (options?.ifFree && lockRef.current) return;
    const current = latest.current;
    lockRef.current = current ? { owner, pos: current.pos } : null;
  }, []);

  const unlock = useCallback(
    (owner: string) => {
      if (lockRef.current?.owner !== owner) return;
      lockRef.current = null;
      schedule();
    },
    [schedule]
  );

  const getBands = useCallback((): Band[] => {
    const container = containerRef.current;
    return container && !editor.isDestroyed
      ? boxesToBands(measureBlocks(editor.view, container.getBoundingClientRect()))
      : [];
  }, [editor, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerMove = (event: PointerEvent) => {
      // Touch has no hover, and the handle is desktop only.
      if (event.pointerType === 'touch') return;
      const box = container.getBoundingClientRect();
      const isNear =
        event.clientX >= box.left - BLOCK_HANDLE_REACH &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (!isNear && pointer.current === null) return;
      pointer.current = isNear ? { x: event.clientX, y: event.clientY } : null;
      schedule();
    };
    const onPointerOut = (event: PointerEvent) => {
      // `relatedTarget` is null when the pointer leaves the window.
      if (event.relatedTarget !== null) return;
      pointer.current = null;
      schedule();
    };
    // A change of the document moves the blocks: the lock follows its block through the mapping.
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      const locked = lockRef.current;
      if (locked && transaction.docChanged) {
        lockRef.current = { ...locked, pos: transaction.mapping.map(locked.pos) };
      }
      schedule();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onPointerOut);
    window.addEventListener('resize', schedule);
    editor.on('transaction', onTransaction);
    const observer = new ResizeObserver(schedule);
    observer.observe(container);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('resize', schedule);
      editor.off('transaction', onTransaction);
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [editor, containerRef, schedule]);

  return { state, getBands, lock, unlock };
}
