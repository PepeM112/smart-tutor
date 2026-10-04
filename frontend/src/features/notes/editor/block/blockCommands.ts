// Commands of the block handle. Each one builds ONE transaction on a top-level block (a direct child of the
// document), so one undo step restores the document. They only change existing blocks, so the saved Markdown
// keeps its format (a move only changes the order of the blocks).
//
// A block is found by its position (`pos`, the place before the node). The pure builders have no DOM access.

import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';

import type { Fragment, Node as PMNode, Schema } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

export type TopBlock = { node: PMNode; pos: number; index: number };

/** The direct children of the document, with their positions. */
export function topLevelBlocks(doc: PMNode): TopBlock[] {
  const blocks: TopBlock[] = [];
  doc.forEach((node, pos, index) => blocks.push({ node, pos, index }));
  return blocks;
}

const findBlock = (doc: PMNode, pos: number): TopBlock | undefined =>
  topLevelBlocks(doc).find(block => block.pos === pos);

/** Put the cursor in the first text of the block at `pos`. A block with no text (a divider) is selected. */
function selectBlock(tr: Transaction, pos: number): Transaction {
  const node = tr.doc.nodeAt(pos);
  if (!node) return tr;
  return node.isLeaf
    ? tr.setSelection(NodeSelection.create(tr.doc, pos))
    : tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1), 1));
}

// ─── select ─────────────────────────────────────────────────────────────────

/** Select the whole block (the menu is open: the block shows which one it acts on). */
export function buildSelectBlockTransaction(state: EditorState, pos: number): Transaction | null {
  const block = findBlock(state.doc, pos);
  return block ? state.tr.setSelection(NodeSelection.create(state.doc, pos)) : null;
}

// ─── move ───────────────────────────────────────────────────────────────────

/**
 * Move the block at `pos` to the gap `gap` (0..count). Gap `i` is the line before block `i`, the last gap
 * is after the last block. A gap next to the block itself changes nothing, and gives `null`.
 */
export function buildMoveBlockTransaction(state: EditorState, pos: number, gap: number): Transaction | null {
  const blocks = topLevelBlocks(state.doc);
  const block = blocks.find(b => b.pos === pos);
  if (!block || gap < 0 || gap > blocks.length) return null;
  if (gap === block.index || gap === block.index + 1) return null;

  const gapPos = gap < blocks.length ? blocks[gap].pos : state.doc.content.size;
  const end = block.pos + block.node.nodeSize;
  // The delete happens first. A gap after the block moves left by the size of the block.
  const target = gapPos > block.pos ? gapPos - block.node.nodeSize : gapPos;

  const tr = state.tr.delete(block.pos, end).insert(target, block.node);
  return selectBlock(tr, target).scrollIntoView();
}

// ─── duplicate / delete ─────────────────────────────────────────────────────

/** Insert a copy of the block right after it and put the cursor in the copy. */
export function buildDuplicateBlockTransaction(state: EditorState, pos: number): Transaction | null {
  const block = findBlock(state.doc, pos);
  if (!block) return null;
  const copyPos = block.pos + block.node.nodeSize;
  return selectBlock(state.tr.insert(copyPos, block.node), copyPos).scrollIntoView();
}

/** Delete the block. The document always needs one block: the last one becomes an empty paragraph. */
export function buildDeleteBlockTransaction(state: EditorState, pos: number): Transaction | null {
  const block = findBlock(state.doc, pos);
  if (!block) return null;
  const end = block.pos + block.node.nodeSize;

  if (state.doc.childCount === 1) {
    const empty = state.schema.nodes.paragraph.createAndFill();
    if (!empty) return null;
    return selectBlock(state.tr.replaceWith(block.pos, end, empty), block.pos);
  }

  const tr = state.tr.delete(block.pos, end);
  // Look back when the deleted block was the last one.
  const bias = block.pos >= tr.doc.content.size ? -1 : 1;
  return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(block.pos, tr.doc.content.size)), bias));
}

// ─── add below ──────────────────────────────────────────────────────────────

const isEmptyParagraph = (node: PMNode): boolean => node.type.name === 'paragraph' && node.content.size === 0;

/**
 * The "+" of the handle: an empty paragraph below the block, with a "/" typed in it. The "/" opens the slash menu.
 * On an empty paragraph, no new block is added: the "/" goes into that paragraph.
 */
export function buildInsertSlashBelowTransaction(state: EditorState, pos: number): Transaction | null {
  const block = findBlock(state.doc, pos);
  if (!block) return null;
  const slash = state.schema.text('/');

  if (isEmptyParagraph(block.node)) {
    const tr = state.tr.insert(block.pos + 1, slash);
    return tr.setSelection(TextSelection.create(tr.doc, block.pos + 2));
  }

  const paragraph = state.schema.nodes.paragraph.create(null, slash);
  const at = block.pos + block.node.nodeSize;
  const tr = state.tr.insert(at, paragraph);
  return tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView();
}

// ─── turn into ──────────────────────────────────────────────────────────────

export type TurnIntoKind =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'callout'
  | 'toggle';

export const TURN_INTO_KINDS: readonly TurnIntoKind[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'callout',
  'toggle',
];

const HEADING_KINDS: readonly TurnIntoKind[] = ['heading1', 'heading2', 'heading3'];

/**
 * What a block is now, in the terms of "turn into". `null` = the block cannot be converted (a table, a divider):
 * it has no plain text to carry over.
 */
export function blockKind(node: PMNode): TurnIntoKind | null {
  switch (node.type.name) {
    case 'heading':
      // Index = level - 1. A level that is not 1 to 3 gives `undefined`, so the block cannot be converted.
      return HEADING_KINDS[Number(node.attrs.level) - 1] ?? null;
    case 'paragraph':
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
    case 'blockquote':
    case 'codeBlock':
    case 'callout':
    case 'toggle':
      // The node name is the kind name for these types.
      return node.type.name;
    default:
      return null;
  }
}

/** The block can be turned into `target`: it is convertible, and it is not that kind already. */
export const canTurnInto = (node: PMNode, target: TurnIntoKind): boolean => {
  const kind = blockKind(node);
  return kind !== null && kind !== target;
};

/**
 * A unit is one "line" of content: a paragraph and the blocks that belong to it (the nested list of a list item).
 * Every conversion goes through units: the source gives units, the target builds blocks from them.
 */
type Unit = PMNode[];

const childrenOf = (node: PMNode): PMNode[] => {
  const children: PMNode[] = [];
  node.forEach(child => children.push(child));
  return children;
};

const paragraphFrom = (schema: Schema, content: Fragment | PMNode): PMNode =>
  schema.nodes.paragraph.create(null, content);

/** Group the children of a quote, a callout or a toggle body: text blocks start a unit, the rest joins the unit before. */
const groupBlocks = (schema: Schema, blocks: PMNode[]): Unit[] =>
  blocks.reduce<Unit[]>((units, block) => {
    if (block.type.name === 'paragraph' || block.type.name === 'heading') {
      return [...units, [paragraphFrom(schema, block.content)]];
    }
    if (units.length === 0) return [[schema.nodes.paragraph.create(), block]];
    return [...units.slice(0, -1), [...units[units.length - 1], block]];
  }, []);

function toUnits(schema: Schema, node: PMNode): Unit[] {
  switch (node.type.name) {
    case 'paragraph':
    case 'heading':
      return [[paragraphFrom(schema, node.content)]];
    case 'codeBlock':
      // One paragraph per line: a line break in a code block would be lost in a paragraph.
      return node.textContent
        .split('\n')
        .map(line => [line ? paragraphFrom(schema, schema.text(line)) : schema.nodes.paragraph.create()]);
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return childrenOf(node).map(childrenOf);
    case 'blockquote':
    case 'callout':
      return groupBlocks(schema, childrenOf(node));
    case 'toggle': {
      const [summary, ...body] = childrenOf(node);
      return [[paragraphFrom(schema, summary.content)], ...groupBlocks(schema, body)];
    }
    default:
      return [];
  }
}

function fromUnits(schema: Schema, kind: TurnIntoKind, units: Unit[]): PMNode[] | null {
  const { nodes } = schema;
  const flat = units.flat();
  const listItem: Partial<Record<TurnIntoKind, string>> = {
    bulletList: 'listItem',
    orderedList: 'listItem',
    taskList: 'taskItem',
  };

  switch (kind) {
    case 'paragraph':
      return flat;
    case 'heading1':
    case 'heading2':
    case 'heading3': {
      const level = Number(kind.slice('heading'.length));
      return units.flatMap(([first, ...rest]) => [nodes.heading.create({ level }, first.content), ...rest]);
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const item = nodes[listItem[kind] ?? ''];
      return [
        nodes[kind].create(
          null,
          units.map(unit => item.create(null, unit))
        ),
      ];
    }
    case 'blockquote':
      return [nodes.blockquote.create(null, flat)];
    case 'callout':
      return [nodes.callout.create({ type: 'note' }, flat)];
    case 'codeBlock': {
      const text = flat.map(block => block.textContent).join('\n');
      return [nodes.codeBlock.create(null, text ? schema.text(text) : undefined)];
    }
    case 'toggle': {
      const [first, ...others] = units;
      const [title, ...firstExtras] = first ?? [nodes.paragraph.create()];
      const body = [...firstExtras, ...others.flat()];
      return [
        nodes.toggle.create(null, [
          nodes.toggleSummary.create(null, title.content),
          ...(body.length > 0 ? body : [nodes.paragraph.create()]),
        ]),
      ];
    }
  }
}

/**
 * Replace the block with the same text in another kind (one transaction).
 * A list, a quote, a callout or a toggle gives its text lines to the new block. A conversion to plain text
 * keeps one paragraph per line. Gives `null` for a block that cannot be converted, the same kind, or a schema
 * that does not have the target type.
 */
export function buildTurnIntoTransaction(state: EditorState, pos: number, target: TurnIntoKind): Transaction | null {
  const block = findBlock(state.doc, pos);
  if (!block || !canTurnInto(block.node, target)) return null;

  try {
    const units = toUnits(state.schema, block.node);
    const blocks = units.length > 0 ? fromUnits(state.schema, target, units) : null;
    if (!blocks || blocks.length === 0) return null;
    const tr = state.tr.replaceWith(block.pos, block.pos + block.node.nodeSize, blocks);
    return selectBlock(tr, block.pos);
  } catch {
    // The schema refused the new structure (a missing node type or a content rule): leave the block as it is.
    return null;
  }
}
