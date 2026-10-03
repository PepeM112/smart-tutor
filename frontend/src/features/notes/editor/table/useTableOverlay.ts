'use client';

// State of the table controls overlay: which table is active, where it is on the screen, which cell
// the mouse is on and what the editor selection is.
//
// The active table is the one under the mouse (or in the zone around it, or in its row band across the
// whole editor width, plus the table menu button left of it), else the one that holds the selection. Touch input has no hover, so on touch only the selection counts.
// All measuring runs in `requestAnimationFrame`, at most once per frame, and the React state changes
// only when a measured value changed.

import { columnResizingPluginKey } from '@tiptap/pm/tables';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { readSelectedLines, type SelectedLines } from './tableCommands';
import {
  hoverFromPoint,
  isInTableBand,
  isOnTable,
  readTableMeasure,
  TABLE_MENU_REACH,
  type CellIndex,
  type TableMeasure,
} from './tableGeometry';

import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';

export type OverlayState = {
  table: TableMeasure;
  /** Cell under the mouse, `null` when the table is active only because of the selection. */
  hover: CellIndex | null;
  /** The editor selection, when it is in this table. */
  selected: SelectedLines | null;
  /** A column is being resized (drag). */
  resizing: boolean;
};

/** `owner` is the control that took the lock. Only that control can release it. */
type Lock = { owner: string; tablePos: number; hover: CellIndex | null };

export type TableOverlay = {
  state: OverlayState | null;
  /**
   * Freeze the active table and the hover while a menu is open or a drag runs. `owner` is a stable ID of
   * the control (`useId`). A new lock replaces the lock of another control.
   */
  lock: (owner: string) => void;
  /**
   * Release the lock, but only when `owner` holds it. A pointer down on a grip closes the open menu of
   * another control. That menu must not release the lock that the new drag took a moment before.
   */
  unlock: (owner: string) => void;
};

export function useTableOverlay(editor: Editor, containerRef: RefObject<HTMLElement | null>): TableOverlay {
  const [state, setState] = useState<OverlayState | null>(null);

  const pointer = useRef<{ x: number; y: number } | null>(null);
  const lockRef = useRef<Lock | null>(null);
  const latest = useRef<OverlayState | null>(null);
  const lastKey = useRef('');
  const frame = useRef(0);

  const measure = useCallback(() => {
    frame.current = 0;
    const container = containerRef.current;
    let next = container ? computeState(editor, container, pointer.current, lockRef.current) : null;
    // Safety net: the locked table is gone (deleted, or its position could not be mapped). A lock with no
    // table hides every control, and the control that took the lock is unmounted, so it never unlocks.
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

  const lock = useCallback((owner: string) => {
    const current = latest.current;
    lockRef.current = current ? { owner, tablePos: current.table.tablePos, hover: current.hover } : null;
  }, []);

  const unlock = useCallback(
    (owner: string) => {
      if (lockRef.current?.owner !== owner) return;
      lockRef.current = null;
      schedule();
    },
    [schedule]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The pointer is tracked on the window, not on the container: the table menu button sits left of
    // the table, often outside the container (in the page padding). With container events, the gap between
    // the table and the button fires `pointerleave` and the button disappears before the pointer reaches it.
    // A move far from the container is ignored, so the overlay does not measure on every move on the page.
    const onPointerMove = (event: PointerEvent) => {
      // Touch has no hover: a tap changes the selection, and the selection drives the controls.
      if (event.pointerType === 'touch') return;
      const box = container.getBoundingClientRect();
      const isNear =
        event.clientX >= box.left - TABLE_MENU_REACH &&
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

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onPointerOut);
    // `scroll` does not bubble. Capture catches the scroll of a wide table inside its wrapper.
    container.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    // The lock holds a document position. A change above the table (typing, undo, a server update) moves the
    // table, so the lock follows it through the mapping of the transaction.
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      const locked = lockRef.current;
      if (locked && transaction.docChanged) {
        lockRef.current = { ...locked, tablePos: transaction.mapping.map(locked.tablePos) };
      }
      schedule();
    };
    editor.on('transaction', onTransaction);
    const observer = new ResizeObserver(schedule);
    observer.observe(container);

    schedule();
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      container.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      editor.off('transaction', onTransaction);
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [editor, containerRef, schedule]);

  return { state, lock, unlock };
}

function computeState(
  editor: Editor,
  container: HTMLElement,
  pointer: { x: number; y: number } | null,
  lock: Lock | null
) {
  if (editor.isDestroyed) return null;
  const { view } = editor;
  const box = container.getBoundingClientRect();

  const measures = Array.from(view.dom.querySelectorAll('table'))
    .map(table => readTableMeasure(view, table, box))
    .filter((measure): measure is TableMeasure => measure !== null);
  if (measures.length === 0) return null;

  const point = pointer ? { x: pointer.x - box.left, y: pointer.y - box.top } : null;
  const selection = readSelectedLines(view.state);

  const hovered =
    point && !lock
      ? (measures.find(m => isOnTable(m, point.x, point.y)) ??
        measures.find(m => hoverFromPoint(m, point.x, point.y) !== null) ??
        // Beside a narrow table: no cell is hovered, but the table menu button stays visible.
        measures.find(m => isInTableBand(m, point.x, point.y, box.width)))
      : undefined;
  const table = lock
    ? measures.find(m => m.tablePos === lock.tablePos)
    : (hovered ?? measures.find(m => m.tablePos === selection?.tablePos));
  if (!table) return null;

  const hover = lock ? lock.hover : hovered && point ? hoverFromPoint(hovered, point.x, point.y) : null;
  const resize = columnResizingPluginKey.getState(view.state);

  const next: OverlayState = {
    table,
    hover,
    selected: selection?.tablePos === table.tablePos ? selection : null,
    resizing: !!resize?.dragging,
  };
  return next;
}
