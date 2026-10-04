// Geometry of the table controls: where the table, its rows and its columns are on the screen,
// and which cell the pointer is on. All numbers are in px, relative to the editor container
// (the element the overlay is positioned in), so the overlay does not need to know about scrolling.
//
// The pure functions (`bandIndexAt`, `hoverFromPoint`, `isInTableBand`, `gapFromPoint`) have no DOM access.
// `readTableMeasure` reads the DOM of one `<table>`.

import { parseTableLayout, type TableLayout } from './tableAttributes';

import type { EditorView } from '@tiptap/pm/view';

/** One row or one column: where it starts and how big it is. */
export type Band = { start: number; size: number };

export type CellIndex = { row: number; col: number };

export type TableMeasure = {
  /** Position of the `table` node in the document. */
  tablePos: number;
  left: number;
  top: number;
  width: number;
  height: number;
  columns: Band[];
  rows: Band[];
  /** Visible part of the table on the x axis. A wide table scrolls inside its wrapper. */
  clipLeft: number;
  clipRight: number;
  /** Distance between the left edge of the table and the left edge of the viewport. */
  viewportLeft: number;
  layout: TableLayout;
  hasHeaderRow: boolean;
  /** A merged cell (colspan / rowspan) breaks the "one cell = one row and one column" rule of the controls. */
  hasMergedCells: boolean;
};

/**
 * Extra space around the table where the pointer still counts as "on the table".
 * It lets the pointer travel from a cell to a handle that sits outside the table.
 */
export const HOVER_ZONE = { left: 36, top: 30, right: 26, bottom: 26 } as const;

/**
 * How far left of the table the band reaches: the table menu button (32px + 12px gap) plus a margin.
 * The button can be outside the editor container (the page padding), so the band must reach it too.
 */
export const TABLE_MENU_REACH = 56;

/**
 * The pointer is in the "block" of the table: its full row band, across the whole width of the editor
 * (also the empty space left and right of a narrow table) and to the table menu button left of it, with
 * the same margin above and below as `HOVER_ZONE`. The table menu button is shown for this zone.
 * `containerWidth` is the right limit: the pointer is tracked on the window, not only in the container.
 */
export const isInTableBand = (table: TableMeasure, x: number, y: number, containerWidth: number): boolean =>
  x >= Math.min(0, table.left - TABLE_MENU_REACH) &&
  x <= containerWidth &&
  y >= table.top - HOVER_ZONE.top &&
  y <= table.top + table.height + HOVER_ZONE.bottom;

/** Size of the table menu button, and the gap between it and the table. */
export const TABLE_HANDLE_SIZE = 32;
export const TABLE_HANDLE_GAP = 12;

/**
 * The table menu button sits left of the table when there is room (a 4px margin to the viewport edge).
 * The block handle reads this too, so the two handles never take the same place.
 */
export const hasTableHandleRoom = (viewportLeft: number): boolean =>
  viewportLeft - TABLE_HANDLE_SIZE - TABLE_HANDLE_GAP >= 4;

/** Index of the band that holds `value`. Outside the bands it gives the first or the last one. */
export function bandIndexAt(bands: Band[], value: number): number {
  const index = bands.findIndex(band => value < band.start + band.size);
  return index === -1 ? Math.max(bands.length - 1, 0) : index;
}

const isInside = (table: TableMeasure, x: number, y: number, zone: typeof HOVER_ZONE | null): boolean => {
  const z = zone ?? { left: 0, top: 0, right: 0, bottom: 0 };
  return (
    x >= table.left - z.left &&
    x <= table.left + table.width + z.right &&
    y >= table.top - z.top &&
    y <= table.top + table.height + z.bottom
  );
};

/** The pointer is on the table itself (not only in the zone around it). */
export const isOnTable = (table: TableMeasure, x: number, y: number): boolean => isInside(table, x, y, null);

/**
 * The cell under the pointer. In the zone around the table it gives the nearest cell, so the handles
 * at the border of the table stay visible while the pointer moves to them. `null` = too far away.
 */
export function hoverFromPoint(table: TableMeasure, x: number, y: number): CellIndex | null {
  if (!isInside(table, x, y, HOVER_ZONE) || table.rows.length === 0 || table.columns.length === 0) return null;
  return { row: bandIndexAt(table.rows, y), col: bandIndexAt(table.columns, x) };
}

/**
 * The gap (0..count) the pointer is nearest to, for a drag. Gap `i` is the line between band `i - 1`
 * and band `i`. A band is passed when the pointer is past its center. `minGap` keeps the drop below
 * the header row.
 */
export function gapFromPoint(bands: Band[], value: number, minGap = 0): number {
  const passed = bands.filter(band => value > band.start + band.size / 2).length;
  return Math.min(Math.max(passed, minGap), bands.length);
}

/** Position (on the drag axis) of the drop line for a gap. */
export function gapOffset(bands: Band[], gap: number): number {
  if (bands.length === 0) return 0;
  if (gap <= 0) return bands[0].start;
  const before = bands[Math.min(gap, bands.length) - 1];
  return before.start + before.size;
}

// ─── DOM ────────────────────────────────────────────────────────────────────

const cellsOf = (table: HTMLTableElement): HTMLTableCellElement[][] =>
  Array.from(table.rows).map(row => Array.from(row.cells));

/** Position of the table node of a table element, from its first cell. `null` while the view is updating. */
function tablePosOf(view: EditorView, table: HTMLTableElement): number | null {
  const firstCell = table.rows[0]?.cells[0];
  if (!firstCell) return null;
  try {
    const $pos = view.state.doc.resolve(view.posAtDOM(firstCell, 0));
    const depth = Array.from({ length: $pos.depth }, (_, i) => $pos.depth - i).find(
      d => $pos.node(d).type.spec.tableRole === 'table'
    );
    return depth === undefined ? null : $pos.before(depth);
  } catch {
    return null;
  }
}

/** Measure one `<table>` of the editor. `container` is the box the overlay is positioned in. */
export function readTableMeasure(view: EditorView, table: HTMLTableElement, container: DOMRect): TableMeasure | null {
  const tablePos = tablePosOf(view, table);
  const cells = cellsOf(table);
  if (tablePos === null || cells.length === 0 || cells[0].length === 0) return null;

  const box = table.getBoundingClientRect();
  const wrapper = (table.parentElement ?? table).getBoundingClientRect();
  const x = (value: number) => value - container.left;
  const y = (value: number) => value - container.top;

  return {
    tablePos,
    left: x(box.left),
    top: y(box.top),
    width: box.width,
    height: box.height,
    columns: cells[0].map(cell => {
      const rect = cell.getBoundingClientRect();
      return { start: x(rect.left), size: rect.width };
    }),
    rows: Array.from(table.rows).map(row => {
      const rect = row.getBoundingClientRect();
      return { start: y(rect.top), size: rect.height };
    }),
    clipLeft: x(Math.max(box.left, wrapper.left)),
    clipRight: x(Math.min(box.right, wrapper.right)),
    viewportLeft: box.left,
    layout: parseTableLayout(table.getAttribute('data-layout')),
    hasHeaderRow: cells[0].every(cell => cell.tagName === 'TH'),
    hasMergedCells: cells.flat().some(cell => cell.colSpan > 1 || cell.rowSpan > 1),
  };
}
