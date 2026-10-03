'use client';

// State of the table controls overlay: which table is active, where it is on the screen, which cell
// the mouse is on and what the editor selection is.
//
// The active table is the one under the mouse (or in the zone around it), else the one that holds the
// selection. Touch input has no hover, so on touch only the selection counts.
// All measuring runs in `requestAnimationFrame`, at most once per frame, and the React state changes
// only when a measured value changed.

import { columnResizingPluginKey } from '@tiptap/pm/tables';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { readSelectedLines, type SelectedLines } from './tableCommands';
import { hoverFromPoint, isOnTable, readTableMeasure, type CellIndex, type TableMeasure } from './tableGeometry';

import type { Editor } from '@tiptap/core';

export type OverlayState = {
  table: TableMeasure;
  /** Cell under the mouse, `null` when the table is active only because of the selection. */
  hover: CellIndex | null;
  /** The editor selection, when it is in this table. */
  selected: SelectedLines | null;
  /** A column is being resized (drag). */
  resizing: boolean;
  /** The mouse is on the resize edge of a column. */
  onResizeEdge: boolean;
};

type Lock = { tablePos: number; hover: CellIndex | null };

export type TableOverlay = {
  state: OverlayState | null;
  /** Freeze the active table and the hover while a menu is open or a drag runs. */
  lock: () => void;
  unlock: () => void;
};

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
        measures.find(m => hoverFromPoint(m, point.x, point.y) !== null))
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
    onResizeEdge: (resize?.activeHandle ?? -1) >= 0,
  };
  return next;
}

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
    const next = container ? computeState(editor, container, pointer.current, lockRef.current) : null;
    const key = JSON.stringify(next);
    if (key === lastKey.current) return;
    lastKey.current = key;
    latest.current = next;
    setState(next);
  }, [editor, containerRef]);

  const schedule = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  const lock = useCallback(() => {
    const current = latest.current;
    lockRef.current = current ? { tablePos: current.table.tablePos, hover: current.hover } : null;
  }, []);

  const unlock = useCallback(() => {
    lockRef.current = null;
    schedule();
  }, [schedule]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerMove = (event: PointerEvent) => {
      // Touch has no hover: a tap changes the selection, and the selection drives the controls.
      if (event.pointerType === 'touch') return;
      pointer.current = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onPointerLeave = () => {
      pointer.current = null;
      schedule();
    };

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
    // `scroll` does not bubble. Capture catches the scroll of a wide table inside its wrapper.
    container.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    editor.on('transaction', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(container);

    schedule();
    return () => {
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      editor.off('transaction', schedule);
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [editor, containerRef, schedule]);

  return { state, lock, unlock };
}
