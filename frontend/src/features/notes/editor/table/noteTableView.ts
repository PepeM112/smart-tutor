// Table node view: the Tiptap `TableView` plus the `data-layout` attribute on the <table>.
//
// Why a subclass: when the table is resizable, prosemirror-tables builds the node view itself
// (`new View(node, cellMinWidth, view)`) and does not pass the HTML attributes. The CSS needs
// `data-layout` on the <table> to switch between compact and full width.

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
  }

  update(node: ProseMirrorNode): boolean {
    const accepted = super.update(node);
    if (accepted) this.syncLayout(node);
    return accepted;
  }

  private syncLayout(node: ProseMirrorNode): void {
    this.table.setAttribute('data-layout', parseTableLayout(node.attrs.layout as string | null));
  }
}
