// Table node view: the Tiptap `TableView` plus the `data-layout` attribute on the <table>.
//
// Why a subclass: when the table is resizable, prosemirror-tables builds the node view itself
// (`new View(node, cellMinWidth, view)`) and does not pass the HTML attributes. The CSS needs
// `data-layout` on the <table> to switch between compact and full width.
//
// It also fixes a stale `<col>` width. Tiptap reuses the `<col>` elements. For a column without a
// width it sets only `min-width` and leaves the old inline `width` there, so a reset (or an undo of a
// resize) changes the document but not the screen. `syncColumnWidths` removes that `width`.

import { TableView } from '@tiptap/extension-table';

import { parseTableLayout } from './tableAttributes';

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

export class NoteTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view?: EditorView,
    htmlAttributes?: Record<string, unknown>
  ) {
    super(node, cellMinWidth, view, htmlAttributes);
    this.syncLayout(node);
    this.syncColumnWidths(node);
  }

  update(node: ProseMirrorNode): boolean {
    const accepted = super.update(node);
    if (accepted) {
      this.syncLayout(node);
      this.syncColumnWidths(node);
    }
    return accepted;
  }

  /** Remove the inline `width` of every `<col>` whose column has no width in the document. */
  private syncColumnWidths(node: ProseMirrorNode): void {
    const cells: ProseMirrorNode[] = [];
    node.firstChild?.forEach(cell => cells.push(cell));
    const widths = cells.flatMap(cell =>
      Array.from({ length: cell.attrs.colspan as number }, (_, i) => (cell.attrs.colwidth as number[] | null)?.[i] ?? 0)
    );
    Array.from(this.colgroup.children).forEach((col, index) => {
      if (!widths[index]) (col as HTMLElement).style.removeProperty('width');
    });
  }

  private syncLayout(node: ProseMirrorNode): void {
    this.table.setAttribute('data-layout', parseTableLayout(node.attrs.layout as string | null));
  }
}
