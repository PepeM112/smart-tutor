// Commands of the table controls (handles and menus).
//
// Every `build*` function takes the editor state and returns ONE transaction (one undo step),
// or `null` when the action is not allowed or has nothing to do. The UI dispatches it and gives the
// focus back to the editor. The functions do not read the current selection: the caller passes a
// `TableTarget`, so a menu works even when the selection moved while it was open.
//
// Header row rule (a row of `th` cells at the top):
// - it cannot be deleted,
// - nothing can be inserted above it,
// - it cannot be moved, and no row can be dropped above it.
// Why: prosemirror-tables keeps the cell *type* by position when rows move, and `addRow` at index 0
// would put `td` cells above the `th` row. These rules keep "the first row is the header" true.

import { TextSelection, type EditorState, type Selection, type Transaction } from '@tiptap/pm/state';
import {
  CellSelection,
  TableMap,
  addColumn,
  addRow,
  moveTableColumn,
  moveTableRow,
  removeColumn,
  removeRow,
} from '@tiptap/pm/tables';

import { isNoteColor, type NoteColor } from '../noteColor';

import type { TableLayout } from './tableAttributes';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

export type TableAxis = 'row' | 'column';
export type CellColorKey = 'color' | 'bg';

/** What an action works on. `tablePos` is the position of the `table` node. */
export type TableTarget =
  | { kind: 'table'; tablePos: number }
  | { kind: 'column'; tablePos: number; index: number }
  | { kind: 'row'; tablePos: number; index: number }
  | { kind: 'cell'; tablePos: number; row: number; col: number };

type TableInfo = { node: ProseMirrorNode; pos: number; start: number; map: TableMap };

/** `undefined` = the cells have different values. */
export type CommonCellColors = { color: NoteColor | null | undefined; bg: NoteColor | null | undefined };

// ─── reading ────────────────────────────────────────────────────────────────

function readTable(state: EditorState, tablePos: number): TableInfo | null {
  const node = state.doc.nodeAt(tablePos);
  if (node?.type.spec.tableRole !== 'table') return null;
  return { node, pos: tablePos, start: tablePos + 1, map: TableMap.get(node) };
}

const isHeaderRow = (info: TableInfo, row: number): boolean => {
  const first = info.node.maybeChild(row);
  return (
    !!first &&
    first.childCount > 0 &&
    Array.from({ length: first.childCount }, (_, i) => first.child(i)).every(
      cell => cell.type.spec.tableRole === 'header_cell'
    )
  );
};

/** Does the first row hold header cells? Controls the header row rule above. */
export function tableHasHeaderRow(state: EditorState, tablePos: number): boolean {
  const info = readTable(state, tablePos);
  return !!info && isHeaderRow(info, 0);
}

/** Cell offsets (relative to the table start) of the target, without duplicates. */
function cellOffsets(info: TableInfo, target: TableTarget): number[] {
  const { map } = info;
  switch (target.kind) {
    case 'table':
      return [];
    case 'column':
      return target.index < 0 || target.index >= map.width
        ? []
        : map.cellsInRect({ left: target.index, right: target.index + 1, top: 0, bottom: map.height });
    case 'row':
      return target.index < 0 || target.index >= map.height
        ? []
        : map.cellsInRect({ left: 0, right: map.width, top: target.index, bottom: target.index + 1 });
    case 'cell':
      return target.row < 0 || target.row >= map.height || target.col < 0 || target.col >= map.width
        ? []
        : [map.map[target.row * map.width + target.col]];
  }
}

/** The color of the target cells. A key is `undefined` when the cells do not agree. */
export function readCommonCellColors(state: EditorState, target: TableTarget): CommonCellColors {
  const info = readTable(state, target.tablePos);
  const cells = info ? cellOffsets(info, target).map(offset => info.node.nodeAt(offset)) : [];
  const common = (key: CellColorKey): NoteColor | null | undefined => {
    const values = cells.map(cell => {
      const value = (cell?.attrs[key] as string | null | undefined) ?? null;
      return isNoteColor(value) ? value : null;
    });
    return values.length > 0 && values.every(value => value === values[0]) ? values[0] : undefined;
  };
  return { color: common('color'), bg: common('bg') };
}

/** Number of rows and columns, `null` when the position is not a table. */
export function tableSize(state: EditorState, tablePos: number): { rows: number; columns: number } | null {
  const info = readTable(state, tablePos);
  return info ? { rows: info.map.height, columns: info.map.width } : null;
}

// ─── what is allowed ────────────────────────────────────────────────────────

/** A line is a row or a column. The last one of a table and the header row cannot be deleted. */
export function canDeleteLine(state: EditorState, target: TableTarget): boolean {
  const info = readTable(state, target.tablePos);
  if (!info) return false;
  if (target.kind === 'column') return info.map.width > 1 && target.index < info.map.width;
  if (target.kind === 'row') {
    return info.map.height > 1 && target.index < info.map.height && !(target.index === 0 && isHeaderRow(info, 0));
  }
  return false;
}

/** Insert position (a gap, 0..count) is valid. No row can be inserted above the header row. */
export function canInsertAt(state: EditorState, tablePos: number, axis: TableAxis, gap: number): boolean {
  const info = readTable(state, tablePos);
  if (!info) return false;
  if (axis === 'column') return gap >= 0 && gap <= info.map.width;
  return gap >= 0 && gap <= info.map.height && !(gap === 0 && isHeaderRow(info, 0));
}

/** The header row cannot move. Columns and body rows can. */
export function canMoveLine(state: EditorState, tablePos: number, axis: TableAxis, index: number): boolean {
  const info = readTable(state, tablePos);
  if (!info) return false;
  if (axis === 'column') return info.map.width > 1 && index >= 0 && index < info.map.width;
  return info.map.height > 1 && index >= 0 && index < info.map.height && !(index === 0 && isHeaderRow(info, 0));
}

/** The lowest gap a moved row can land on: below the header row, if there is one. */
export function minRowGap(state: EditorState, tablePos: number): number {
  return tableHasHeaderRow(state, tablePos) ? 1 : 0;
}

// ─── selection ──────────────────────────────────────────────────────────────

/** A `CellSelection` of the whole column / row / one cell. `null` for the `table` target. */
export function buildSelectTransaction(state: EditorState, target: TableTarget): Transaction | null {
  const info = readTable(state, target.tablePos);
  if (!info || target.kind === 'table') return null;
  const { map, start, node } = info;
  const at = (row: number, col: number) => state.doc.resolve(start + map.positionAt(row, col, node));

  if (target.kind === 'column') {
    if (target.index >= map.width) return null;
    return state.tr.setSelection(CellSelection.colSelection(at(0, target.index), at(map.height - 1, target.index)));
  }
  if (target.kind === 'row') {
    if (target.index >= map.height) return null;
    return state.tr.setSelection(CellSelection.rowSelection(at(target.index, 0), at(target.index, map.width - 1)));
  }
  if (target.row >= map.height || target.col >= map.width) return null;
  return state.tr.setSelection(new CellSelection(at(target.row, target.col)));
}

// ─── cell content and color ─────────────────────────────────────────────────

/** Set the text color (`color`) or the background (`bg`) of the target cells. `null` = default. */
export function buildSetCellColorTransaction(
  state: EditorState,
  target: TableTarget,
  key: CellColorKey,
  value: NoteColor | null
): Transaction | null {
  const info = readTable(state, target.tablePos);
  if (!info) return null;

  const tr = state.tr;
  cellOffsets(info, target).forEach(offset => {
    const cell = info.node.nodeAt(offset);
    if (cell && (cell.attrs[key] ?? null) !== value) {
      // Same node size: the positions of the other cells do not change.
      tr.setNodeMarkup(info.start + offset, undefined, { ...cell.attrs, [key]: value });
    }
  });
  return tr.docChanged ? tr : null;
}

/** Empty the cells of the target. The cells, their widths and their colors stay. */
export function buildClearCellsTransaction(state: EditorState, target: TableTarget): Transaction | null {
  const info = readTable(state, target.tablePos);
  if (!info) return null;

  const tr = state.tr;
  // From the end to the start: a change does not move the cells that are still to do.
  [...cellOffsets(info, target)]
    .sort((a, b) => b - a)
    .forEach(offset => {
      const pos = info.start + offset;
      const cell = tr.doc.nodeAt(pos);
      const empty = cell?.type.createAndFill()?.content;
      if (!cell || !empty || cell.content.eq(empty)) return;
      tr.replaceWith(pos + 1, pos + cell.nodeSize - 1, empty);
    });
  return tr.docChanged ? tr : null;
}

// ─── structure ──────────────────────────────────────────────────────────────

const toRect = (info: TableInfo) => ({
  left: 0,
  top: 0,
  right: info.map.width,
  bottom: info.map.height,
  map: info.map,
  table: info.node,
  tableStart: info.start,
});

/** Insert an empty column or row at the gap `gap` (0 = before the first, `count` = after the last). */
export function buildInsertTransaction(
  state: EditorState,
  tablePos: number,
  axis: TableAxis,
  gap: number
): Transaction | null {
  const info = readTable(state, tablePos);
  if (!info || !canInsertAt(state, tablePos, axis, gap)) return null;
  const tr = state.tr;
  return axis === 'column' ? addColumn(tr, toRect(info), gap) : addRow(tr, toRect(info), gap);
}

/** Delete one column or row. See `canDeleteLine` for the cases that are refused. */
export function buildDeleteLineTransaction(state: EditorState, target: TableTarget): Transaction | null {
  const info = readTable(state, target.tablePos);
  if (!info || !canDeleteLine(state, target) || (target.kind !== 'column' && target.kind !== 'row')) return null;

  const tr = state.tr;
  (target.kind === 'column' ? removeColumn : removeRow)(tr, toRect(info), target.index);
  // A selection on the deleted cells is mapped onto the next column or across rows, and the next keystroke
  // would replace that content. Put a collapsed cursor in the table.
  if (!tr.selection.empty) {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(info.start + 1, tr.doc.content.size))));
  }
  return tr;
}

export function buildSetLayoutTransaction(
  state: EditorState,
  tablePos: number,
  layout: TableLayout
): Transaction | null {
  const info = readTable(state, tablePos);
  if (!info || info.node.attrs.layout === layout) return null;
  return state.tr.setNodeMarkup(tablePos, undefined, { ...info.node.attrs, layout });
}

// ─── move ───────────────────────────────────────────────────────────────────

/**
 * Index of the line after a move to the gap `gap` (0..count).
 * Moving to the gap right before or right after the line itself changes nothing.
 */
export function indexAfterMove(from: number, gap: number): number {
  return gap > from ? gap - 1 : gap;
}

/**
 * Move a column or a row to the gap `gap`. The cells keep their attributes, so a column keeps its
 * width and the colors move with their cells. Two dispatches: the first one only selects the line
 * (prosemirror-tables reads the table from the selection), so one undo step undoes the move.
 * Returns `false` when nothing moved.
 */
export function moveTableLine(view: EditorView, tablePos: number, axis: TableAxis, from: number, gap: number): boolean {
  const to = indexAfterMove(from, gap);
  if (to === from || !canMoveLine(view.state, tablePos, axis, from)) return false;
  if (axis === 'row' && to < minRowGap(view.state, tablePos)) return false;

  const select = buildSelectTransaction(view.state, { kind: axis, tablePos, index: from });
  if (select) view.dispatch(select);

  const options = { from, to, pos: tablePos + 1, select: true };
  const command = axis === 'column' ? moveTableColumn(options) : moveTableRow(options);
  return command(view.state, tr => view.dispatch(tr));
}

// ─── selection → target (for the overlay) ───────────────────────────────────

export type SelectedLines = {
  tablePos: number;
  /** Set when the whole column / row is selected, or when the cursor is in a cell. */
  row: number | null;
  col: number | null;
  /** The cell that holds the cursor / the head of the selection. */
  cell: { row: number; col: number } | null;
  /** The selection covers a whole column, a whole row or both (cell selection). */
  wholeColumn: boolean;
  wholeRow: boolean;
};

/** The cell the selection is in (a cell selection: its head cell) and the position of its table. */
function locateCell(selection: Selection): { cellPos: number; tablePos: number } | null {
  if (selection instanceof CellSelection) {
    const $head = selection.$headCell;
    return { cellPos: $head.pos, tablePos: $head.before($head.depth - 1) };
  }
  const { $from } = selection;
  const cellDepth = Array.from({ length: $from.depth }, (_, i) => $from.depth - i).find(depth => {
    const role = $from.node(depth).type.spec.tableRole as string | undefined;
    return role === 'cell' || role === 'header_cell';
  });
  return cellDepth === undefined ? null : { cellPos: $from.before(cellDepth), tablePos: $from.before(cellDepth - 2) };
}

/** The table, row and column the editor selection is in. `null` when it is not in a table. */
export function readSelectedLines(state: EditorState): SelectedLines | null {
  const { selection } = state;
  const located = locateCell(selection);
  if (!located) return null;

  const info = readTable(state, located.tablePos);
  if (!info) return null;

  const tablePos = located.tablePos;
  const rect = info.map.findCell(located.cellPos - info.start);
  const base = { tablePos, cell: { row: rect.top, col: rect.left }, wholeColumn: false, wholeRow: false };

  if (!(selection instanceof CellSelection)) return { ...base, row: rect.top, col: rect.left };

  const sel = info.map.rectBetween(selection.$anchorCell.pos - info.start, selection.$headCell.pos - info.start);
  const wholeColumn = sel.top === 0 && sel.bottom === info.map.height;
  const wholeRow = sel.left === 0 && sel.right === info.map.width;
  return {
    ...base,
    wholeColumn,
    wholeRow,
    col: wholeColumn && !wholeRow && sel.right - sel.left === 1 ? sel.left : wholeRow ? null : rect.left,
    row: wholeRow && !wholeColumn && sel.bottom - sel.top === 1 ? sel.top : wholeColumn ? null : rect.top,
  };
}
