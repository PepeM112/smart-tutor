// Shared types and helpers for the note table nodes.
//
// Node attributes (all saved in the markdown as HTML attributes, see `tableHtml.ts`):
//   table                : layout  'compact' (default) | 'full'
//   tableCell/tableHeader: colwidth (prosemirror-tables), color + bg (Notion palette names), align
// The attribute names are the contract for the table controls (handles, menus, drag):
//   editor.commands.setCellAttribute('color' | 'bg', NoteColor | null)

import { isNoteColor, type NoteColor } from '../noteColor';

export const TABLE_LAYOUTS = ['compact', 'full'] as const;
export type TableLayout = (typeof TABLE_LAYOUTS)[number];
export const DEFAULT_TABLE_LAYOUT: TableLayout = 'compact';

/** Minimum column width in px. The resize drag stops here, and unsized columns start here. */
export const TABLE_CELL_MIN_WIDTH = 64;

export type TableCellColorAttrs = { color: NoteColor | null; bg: NoteColor | null };

/** Unknown values fall back to the default layout. */
export function parseTableLayout(value: string | null | undefined): TableLayout {
  return TABLE_LAYOUTS.find(layout => layout === value) ?? DEFAULT_TABLE_LAYOUT;
}

/** Read a palette name from an HTML attribute. Unknown names become `null`. */
export function parseCellColor(value: string | null): NoteColor | null {
  return isNoteColor(value) ? value : null;
}
