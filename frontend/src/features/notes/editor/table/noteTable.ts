// Table extensions for the note editor (replaces `TableKit`).
//
// - Table: `layout` attribute, resizable columns, `NoteTableView`, markdown saved as HTML.
// - TableCell / TableHeader: `color` and `bg` attributes (Notion palette names), next to the
//   `colwidth` and `align` attributes of Tiptap.
// - Double-click on a resize handle resets the column width.
// Markdown *loading* of the old GFM pipe tables is still done by the Tiptap table node.

import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

import { NoteTableView } from './noteTableView';
import { ResetColumnWidthOnDoubleClick } from './resetColumnWidth';
import {
  DEFAULT_TABLE_LAYOUT,
  parseCellColor,
  parseTableLayout,
  TABLE_CELL_MIN_WIDTH,
  type TableCellColorAttrs,
  type TableLayout,
} from './tableAttributes';
import { renderTableAsHtml } from './tableHtml';

import type { AnyExtension, Editor } from '@tiptap/core';

const cellColorAttributes = {
  color: {
    default: null,
    parseHTML: (el: HTMLElement) => parseCellColor(el.getAttribute('data-color')),
    renderHTML: (attrs: Partial<TableCellColorAttrs>) => (attrs.color ? { 'data-color': attrs.color } : {}),
  },
  bg: {
    default: null,
    parseHTML: (el: HTMLElement) => parseCellColor(el.getAttribute('data-bg')),
    renderHTML: (attrs: Partial<TableCellColorAttrs>) => (attrs.bg ? { 'data-bg': attrs.bg } : {}),
  },
};

/**
 * Create the table extension list. Call it once per editor.
 *
 * Why a factory: `renderMarkdown` does not get the editor, but the HTML of the cell content needs
 * its schema. The Table extension stores the editor in `host` when the editor starts.
 */
export function createNoteTableExtensions(): AnyExtension[] {
  const host: { editor: Editor | null } = { editor: null };

  const NoteTable = Table.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        layout: {
          default: DEFAULT_TABLE_LAYOUT,
          parseHTML: (el: HTMLElement) => parseTableLayout(el.getAttribute('data-layout')),
          renderHTML: (attrs: { layout?: TableLayout }) => ({ 'data-layout': attrs.layout ?? DEFAULT_TABLE_LAYOUT }),
        },
      };
    },

    addProseMirrorPlugins() {
      host.editor = this.editor;
      return this.parent?.() ?? [];
    },

    renderMarkdown: node => renderTableAsHtml(node, host.editor?.schema ?? null),
  }).configure({
    resizable: true,
    cellMinWidth: TABLE_CELL_MIN_WIDTH,
    lastColumnResizable: true,
    View: NoteTableView,
  });

  const NoteTableCell = TableCell.extend({
    addAttributes() {
      return { ...this.parent?.(), ...cellColorAttributes };
    },
  });

  const NoteTableHeader = TableHeader.extend({
    addAttributes() {
      return { ...this.parent?.(), ...cellColorAttributes };
    },
  });

  return [NoteTable, TableRow, NoteTableCell, NoteTableHeader, ResetColumnWidthOnDoubleClick];
}
