// Double-click on a column resize handle: reset that column to its default width.
//
// prosemirror-tables stores a dragged width as `colwidth` on every cell of the column.
// A reset sets it back to `null` in all those cells, in one transaction (one undo step).
//
// Why the double-click is found from two `mousedown` events and not from `dblclick`:
// prosemirror-tables starts a resize drag on every `mousedown` on the handle and writes the width
// again on `mouseup`. It redraws the handle and the cell on each of these steps, so the browser
// can drop the `click` / `dblclick` events, and a reset that runs from them also runs after the
// extra writes. On the second `mousedown` we reset the column and stop the event: no second drag
// starts, so nothing writes the width after the reset.

import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { columnResizingPluginKey, TableMap } from '@tiptap/pm/tables';

import type { EditorState, Transaction } from '@tiptap/pm/state';

/**
 * Build the transaction that clears the width of the column that contains the cell at `cellPos`.
 * Returns `null` when the position is not a cell or no cell of the column has a width.
 * A cell with `colspan > 1` stores one width per spanned column. Only the entry of the target
 * column is cleared, and the attribute becomes `null` when no entry is left.
 */
export function buildResetColumnWidthTransaction(state: EditorState, cellPos: number): Transaction | null {
  const $cell = state.doc.resolve(cellPos);
  const cell = $cell.nodeAfter;
  if (!cell || $cell.depth < 1) return null;

  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const column = map.colCount($cell.pos - tableStart) + (cell.attrs.colspan as number) - 1;

  const tr = state.tr;
  Array.from({ length: map.height }, (_, row) => row * map.width + column)
    // A cell with rowspan > 1 is in the map once per row: handle it only once.
    .filter((index, row) => row === 0 || map.map[index] !== map.map[index - map.width])
    .forEach(index => {
      const pos = map.map[index];
      const node = table.nodeAt(pos);
      const widths = node?.attrs.colwidth as number[] | null | undefined;
      if (!node || !widths) return;

      const next = widths.slice();
      next[node.attrs.colspan === 1 ? 0 : column - map.colCount(pos)] = 0;
      tr.setNodeMarkup(tableStart + pos, null, {
        ...node.attrs,
        colwidth: next.some(width => width > 0) ? next : null,
      });
    });

  return tr.docChanged ? tr : null;
}

/** A `mousedown` on a resize edge. */
export type EdgePress = { time: number; x: number; y: number };

/** Maximum time (ms) and distance (px) between the two presses of a double-click. */
export const DOUBLE_PRESS_MS = 500;
export const DOUBLE_PRESS_DISTANCE = 4;

export const isDoublePress = (previous: EdgePress | null, next: EdgePress): boolean =>
  previous !== null &&
  next.time - previous.time <= DOUBLE_PRESS_MS &&
  Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_PRESS_DISTANCE;

/**
 * Adds the double-click handler. Only active for editable editors, like the resize plugin itself.
 *
 * `priority`: this plugin must see the `mousedown` before the resize plugin of the Table extension.
 * The resize plugin calls `preventDefault()` on the `mousedown` that starts a drag, and ProseMirror
 * does not call the next plugin for an event that is already prevented.
 */
export const ResetColumnWidthOnDoubleClick = Extension.create({
  name: 'resetColumnWidthOnDoubleClick',
  priority: 1000,

  addProseMirrorPlugins() {
    let previous: EdgePress | null = null;

    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!view.editable || event.button !== 0) return false;
              // `activeHandle` is the position of the cell left of the handle under the mouse (-1 = none).
              const handle = columnResizingPluginKey.getState(view.state)?.activeHandle ?? -1;
              if (handle < 0) {
                previous = null;
                return false;
              }

              const press: EdgePress = { time: Date.now(), x: event.clientX, y: event.clientY };
              if (!isDoublePress(previous, press)) {
                previous = press;
                return false;
              }

              previous = null;
              // Stops the text selection and the second drag of prosemirror-tables.
              event.preventDefault();
              const tr = buildResetColumnWidthTransaction(view.state, handle);
              if (tr) view.dispatch(tr);
              return true;
            },
          },
        },
      }),
    ];
  },
});
