// Block-specific actions of the block handle menu, as data.
//
// The menu has two groups: the actions of this kind of block (a table: full width, add row / column; a code
// block: copy, wrap; a callout: type), then the common ones (turn into, duplicate, delete). The common group
// is in `BlockHandle.tsx`. The first group comes from here: `SECTION_BUILDERS` maps a node type name to a
// builder. A new kind of block adds one entry here and its menu section appears. The menu component does not
// change, because it only renders sections (`BlockActionMenuItems.tsx`).
//
// A builder is pure: it reads the node and returns descriptors with message keys and callbacks. It has no
// React and no DOM, so the registry is unit tested.

import { Copy, Plus, Replace, type LucideIcon } from 'lucide-react';

import { buildSetCalloutTypeTransaction } from '../callout/calloutCommands';
import { CALLOUT_ICONS } from '../callout/calloutIcons';
import { CALLOUT_TYPES, toCalloutType } from '../callout/calloutTypes';
import { buildToggleCodeWrapTransaction, isCodeWrapped } from '../codeBlockWrap';
import { copyText } from '../copyText';
import { parseTableLayout } from '../table/tableAttributes';
import { buildInsertTransaction, buildSetLayoutTransaction, tableSize } from '../table/tableCommands';

import { blockKind } from './blockCommands';

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

// ─── descriptors ─────────────────────────────────────────────────────────────

/** Message keys are in the `notes` namespace. */
export type BlockAction =
  | { type: 'item'; id: string; labelKey: string; icon: LucideIcon; onSelect: () => void }
  | { type: 'toggle'; id: string; labelKey: string; checked: boolean; onCheckedChange: (checked: boolean) => void }
  | {
      type: 'submenu';
      id: string;
      labelKey: string;
      icon: LucideIcon;
      options: {
        id: string;
        labelKey: string;
        icon: LucideIcon;
        /** Set as `data-callout-icon` on the icon: the stylesheet colors it like the callout of that type. */
        iconTint?: string;
        checked: boolean;
        onSelect: () => void;
      }[];
    };

export type BlockSection = {
  id: string;
  /** Small label above the group. */
  labelKey: string;
  actions: BlockAction[];
};

export type BlockActionContext = {
  editor: Editor;
  node: PMNode;
  /** Position of the block (the place before the node). */
  pos: number;
  /** Run a command as the menu action: one transaction, and the block selection is kept after the menu closes. */
  run: (build: (state: EditorState) => Transaction | null) => void;
  /** Translate a key of the `notes` namespace (for text that goes into a toast). */
  t: (key: string) => string;
};

type SectionBuilder = (ctx: BlockActionContext) => BlockSection;

// ─── table ───────────────────────────────────────────────────────────────────

const tableSection: SectionBuilder = ({ node, pos, run }) => {
  const layout = parseTableLayout(node.attrs.layout);
  // Add at the end: the gap after the last row / column. The size comes from the table map (merged cells).
  const addAtEnd = (axis: 'row' | 'column') =>
    run(state => {
      const size = tableSize(state, pos);
      return size && buildInsertTransaction(state, pos, axis, axis === 'column' ? size.columns : size.rows);
    });

  return {
    id: 'table',
    labelKey: 'block_section_table',
    actions: [
      {
        type: 'toggle',
        id: 'full-width',
        labelKey: 'table_layout_full',
        checked: layout === 'full',
        onCheckedChange: checked => run(state => buildSetLayoutTransaction(state, pos, checked ? 'full' : 'compact')),
      },
      { type: 'item', id: 'add-row', labelKey: 'table_add_row', icon: Plus, onSelect: () => addAtEnd('row') },
      { type: 'item', id: 'add-column', labelKey: 'table_add_column', icon: Plus, onSelect: () => addAtEnd('column') },
    ],
  };
};

// ─── code block ──────────────────────────────────────────────────────────────

const codeSection: SectionBuilder = ({ editor, node, pos, t }) => ({
  id: 'code',
  labelKey: 'block_section_code',
  actions: [
    {
      type: 'item',
      id: 'copy',
      labelKey: 'code_copy',
      icon: Copy,
      onSelect: () => void copyText(node.textContent, { copied: t('code_copied'), failed: t('code_copy_failed') }),
    },
    {
      type: 'toggle',
      id: 'wrap',
      labelKey: 'code_wrap_on',
      checked: isCodeWrapped(editor.state, pos),
      // Not through `run`: the wrap is view-only and changes no content, so the old selection comes back.
      onCheckedChange: () => {
        const tr = buildToggleCodeWrapTransaction(editor.state, pos);
        if (tr) editor.view.dispatch(tr);
      },
    },
  ],
});

// ─── callout ─────────────────────────────────────────────────────────────────

const calloutSection: SectionBuilder = ({ node, pos, run }) => {
  const current = toCalloutType(node.attrs.type);
  return {
    id: 'callout',
    labelKey: 'block_section_callout',
    actions: [
      {
        type: 'submenu',
        id: 'callout-type',
        labelKey: 'block_callout_type',
        icon: Replace,
        options: CALLOUT_TYPES.map(type => ({
          id: type,
          labelKey: `callout_${type}`,
          icon: CALLOUT_ICONS[type],
          iconTint: type,
          checked: type === current,
          onSelect: () => run(state => buildSetCalloutTypeTransaction(state, pos, type)),
        })),
      },
    ],
  };
};

// ─── registry ────────────────────────────────────────────────────────────────

/** Node type name → the section of that block. A block that is not here has only the common group. */
const SECTION_BUILDERS: Readonly<Record<string, SectionBuilder>> = {
  table: tableSection,
  codeBlock: codeSection,
  callout: calloutSection,
};

export const getBlockSections = (ctx: BlockActionContext): BlockSection[] => {
  const build = SECTION_BUILDERS[ctx.node.type.name];
  return build ? [build(ctx)] : [];
};

/** "Turn into" is for blocks that have text to carry over. A table or a divider has none, so the item is hidden. */
export const hasTurnInto = (node: PMNode): boolean => blockKind(node) !== null;
