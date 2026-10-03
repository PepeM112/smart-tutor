// Double-click on a column resize handle: reset that column to its default width.
//
// prosemirror-tables stores a dragged width as `colwidth` on every cell of the column.
// A reset sets it back to `null` in all those cells, in one transaction (one undo step).

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

/** Adds the double-click handler. Only active for editable editors, like the resize plugin itself. */
export const ResetColumnWidthOnDoubleClick = Extension.create({
  name: 'resetColumnWidthOnDoubleClick',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            dblclick: (view, event) => {
              if (!view.editable) return false;
              // `activeHandle` is the position of the cell left of the handle under the mouse (-1 = none).
              const handle = columnResizingPluginKey.getState(view.state)?.activeHandle ?? -1;
              if (handle < 0) return false;

              // Stop the browser from selecting a word at the handle.
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
