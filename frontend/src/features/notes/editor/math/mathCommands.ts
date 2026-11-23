// Commands of the math popover. Each one is ONE transaction, so one undo step restores the document.

import { NodeSelection, Selection } from '@tiptap/pm/state';

import { MATH_FOCUS_META } from './mathFocus';

import type { Editor, Range } from '@tiptap/core';
import type { Node as ProseNode, ResolvedPos } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

export type MathKind = 'inlineMath' | 'blockMath';

export type MathTarget = { kind: MathKind; pos: number; latex: string };

const isMathKind = (name: string): name is MathKind => name === 'inlineMath' || name === 'blockMath';

/** The math node the selection holds (a click or the arrow keys select the node). `null` for any other selection. */
export function selectedMath(state: EditorState): MathTarget | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return null;
  const { name } = selection.node.type;
  return isMathKind(name) ? { kind: name, pos: selection.from, latex: String(selection.node.attrs.latex ?? '') } : null;
}

/** Slash command: replace the "/" text with an empty math node and select it, so the popover opens. */
export function insertMath(editor: Editor, range: Range, kind: MathKind): boolean {
  const type = editor.state.schema.nodes[kind];
  const node = type.create({ latex: '' });
  const tr = editor.state.tr.deleteRange(range.from, range.to);
  const $from = tr.doc.resolve(range.from);

  if (kind === 'inlineMath') tr.insert(range.from, node);
  const at = kind === 'blockMath' ? insertBlockMath(tr, $from, node) : range.from;
  tr.setSelection(NodeSelection.create(tr.doc, at));
  editor.view.dispatch(tr.setMeta(MATH_FOCUS_META, true).scrollIntoView());
  editor.view.focus();
  return true;
}

/** A block never goes inside a line: it replaces the empty paragraph of the "/", or goes after the paragraph. */
function insertBlockMath(tr: Transaction, $from: ResolvedPos, node: ProseNode): number {
  const { parent } = $from;
  const isEmptyParagraph = parent.type.name === 'paragraph' && parent.content.size === 0;
  // The first paragraph of a list item cannot become a block, so a block goes after it there.
  const canReplace =
    isEmptyParagraph &&
    $from.depth > 0 &&
    $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), node.type);

  if (!canReplace) {
    const at = $from.after();
    tr.insert(at, node);
    return at;
  }
  // A paragraph after the block gives the cursor a place to go when the popover closes.
  const at = $from.before();
  tr.replaceWith(at, $from.after(), [node, parent.type.create()]);
  return at;
}

/** Change the latex of the node at `pos`. The node stays selected: the popover shows for the selected node. */
export function buildUpdateLatexTransaction(state: EditorState, pos: number, latex: string): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || !isMathKind(node.type.name)) return null;
  const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex });
  return tr.setSelection(NodeSelection.create(tr.doc, pos));
}

/** Delete the node at `pos` and put the cursor where it was. */
export function buildRemoveMathTransaction(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || !isMathKind(node.type.name)) return null;
  const tr = state.tr.delete(pos, pos + node.nodeSize);
  return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1));
}

/** Put the cursor after the node at `pos`. At the end of the document a block gets an empty paragraph first. */
export function buildLeaveMathTransaction(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || !isMathKind(node.type.name)) return null;
  const end = pos + node.nodeSize;
  const tr = state.tr;
  const next = Selection.findFrom(tr.doc.resolve(end), 1, true);
  if (next) return tr.setSelection(next);

  const paragraph = state.schema.nodes.paragraph.create();
  tr.insert(end, paragraph);
  return tr.setSelection(Selection.near(tr.doc.resolve(end + 1), 1));
}
