// @vitest-environment jsdom

// Tests of the block handle commands on a light editor (same extensions as `markdown.test.ts`, no React).
// The main check: a move changes the order of the blocks and nothing else in the saved Markdown.

import { Editor } from '@tiptap/core';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import { closeHistory } from '@tiptap/pm/history';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { afterAll, describe, expect, it } from 'vitest';

import { NoteCallout } from '../callout/noteCallout';
import { NoteLink } from '../link/noteLink';
import { parseMarkdown, serializeMarkdown } from '../markdown';
import { NoteCodeBlock } from '../noteCodeBlock';
import { NoteColorMark } from '../noteColor';
import { createNoteTableExtensions } from '../table/noteTable';
import { NoteToggle, NoteToggleSummary } from '../toggle/noteToggle';

import {
  blockKind,
  buildDeleteBlockTransaction,
  buildDuplicateBlockTransaction,
  buildInsertSlashBelowTransaction,
  buildMoveBlockTransaction,
  buildTurnIntoTransaction,
  canTurnInto,
  topLevelBlocks,
  TURN_INTO_KINDS,
  type TurnIntoKind,
} from './blockCommands';

const lowlight = createLowlight(common);

// Created at module level: the fixtures below are normalized with it when the file loads.
const editor = new Editor({
  extensions: [
    StarterKit.configure({ codeBlock: false, heading: { levels: [1, 2, 3] }, link: false }),
    Markdown,
    NoteLink.configure({ openOnClick: false, autolink: true }),
    ...createNoteTableExtensions(),
    TaskList,
    TaskItem.configure({ nested: true }),
    NoteCodeBlock.configure({ lowlight }),
    NoteColorMark,
    NoteCallout,
    NoteToggle,
    NoteToggleSummary,
  ],
  content: '',
});

afterAll(() => {
  editor.destroy();
});

// ─── helpers ─────────────────────────────────────────────────────────────────

const load = (md: string): void => {
  // Not in the history: an undo in a test must not undo the load.
  editor.chain().setMeta('addToHistory', false).setContent(parseMarkdown(editor, md), { emitUpdate: false }).run();
  // The next change starts a new undo step. Without this, changes within 500 ms of an earlier test share one step.
  editor.view.dispatch(closeHistory(editor.state.tr));
};

/** One round-trip: the normalized form of a Markdown string. */
const normalize = (md: string): string => {
  load(md);
  return serializeMarkdown(editor);
};

const posOf = (index: number): number => topLevelBlocks(editor.state.doc)[index].pos;

const blockTexts = (): string[] => topLevelBlocks(editor.state.doc).map(b => b.node.type.name);

// One block of every type. StarterKit adds an empty paragraph after a last block that is not a paragraph (the trailing
// node), so a move to the end can add one: the checks ignore trailing blank lines. No two neighbours of the same list type, so they cannot merge when they are joined.
const BLOCKS = [
  'Plain paragraph with **bold** text.',
  '## A heading',
  '- one\n- two\n  - nested',
  '> A quote',
  '---',
  '```python\nprint(1)\n```',
  '> [!TIP]\n> Callout text',
  '<details>\n<summary>Toggle title</summary>\n\nToggle body\n\n</details>',
  '| A | B |\n| --- | --- |\n| 1 | 2 |',
  '- [ ] task one\n- [x] task two',
  '1. first\n2. second',
  'Last paragraph',
].map(md => normalize(md).trim());

const DOC = BLOCKS.join('\n\n');

/** Expected Markdown after moving block `from` to gap `gap`: the same blocks in a new order. */
const reordered = (from: number, gap: number): string => {
  const rest = BLOCKS.filter((_, i) => i !== from);
  const at = gap > from ? gap - 1 : gap;
  return [...rest.slice(0, at), BLOCKS[from], ...rest.slice(at)].join('\n\n');
};

// ─── move ────────────────────────────────────────────────────────────────────

describe('move block', () => {
  it('the fixture has one block per fixture entry', () => {
    load(DOC);
    expect(topLevelBlocks(editor.state.doc)).toHaveLength(BLOCKS.length);
    expect(serializeMarkdown(editor)).toBe(DOC);
  });

  it.each(BLOCKS.map((_, i) => i))('moving block %i to the end and to the start changes only the order', index => {
    [0, BLOCKS.length].forEach(gap => {
      load(DOC);
      const tr = buildMoveBlockTransaction(editor.state, posOf(index), gap);
      if (gap === index || gap === index + 1) {
        expect(tr).toBeNull();
        return;
      }
      expect(tr).not.toBeNull();
      editor.view.dispatch(tr!);
      expect(serializeMarkdown(editor).trimEnd()).toBe(reordered(index, gap));
    });
  });

  it('moves a block to a gap in the middle (both directions)', () => {
    load(DOC);
    editor.view.dispatch(buildMoveBlockTransaction(editor.state, posOf(1), 4)!);
    expect(serializeMarkdown(editor).trimEnd()).toBe(reordered(1, 4));

    load(DOC);
    editor.view.dispatch(buildMoveBlockTransaction(editor.state, posOf(6), 2)!);
    expect(serializeMarkdown(editor).trimEnd()).toBe(reordered(6, 2));
  });

  it('a gap next to the block changes nothing', () => {
    load(DOC);
    expect(buildMoveBlockTransaction(editor.state, posOf(3), 3)).toBeNull();
    expect(buildMoveBlockTransaction(editor.state, posOf(3), 4)).toBeNull();
  });

  it('is one transaction: one undo restores the order', () => {
    load(DOC);
    const before = serializeMarkdown(editor);
    editor.view.dispatch(buildMoveBlockTransaction(editor.state, posOf(2), BLOCKS.length)!);
    expect(serializeMarkdown(editor)).not.toBe(before);
    editor.commands.undo();
    expect(serializeMarkdown(editor)).toBe(before);
  });

  it('refuses a position that is not a top-level block', () => {
    load(DOC);
    expect(buildMoveBlockTransaction(editor.state, posOf(2) + 1, 0)).toBeNull();
  });
});

// ─── duplicate / delete / add ────────────────────────────────────────────────

describe('duplicate and delete', () => {
  it.each(BLOCKS.map((_, i) => i))('duplicate of block %i inserts an identical block after it', index => {
    load(DOC);
    editor.view.dispatch(buildDuplicateBlockTransaction(editor.state, posOf(index))!);
    const expected = [...BLOCKS.slice(0, index + 1), BLOCKS[index], ...BLOCKS.slice(index + 1)].join('\n\n');
    expect(serializeMarkdown(editor)).toBe(expected);
  });

  it('delete removes the block, and undo brings it back', () => {
    load(DOC);
    editor.view.dispatch(buildDeleteBlockTransaction(editor.state, posOf(1))!);
    expect(serializeMarkdown(editor)).toBe(BLOCKS.filter((_, i) => i !== 1).join('\n\n'));
    editor.commands.undo();
    expect(serializeMarkdown(editor)).toBe(DOC);
  });

  it('delete removes a table (the menu has no separate "Delete table"), and undo brings it back', () => {
    load(DOC);
    const tableIndex = blockTexts().indexOf('table');
    editor.view.dispatch(buildDeleteBlockTransaction(editor.state, posOf(tableIndex))!);
    expect(blockTexts()).not.toContain('table');
    expect(() => editor.state.doc.check()).not.toThrow();
    editor.commands.undo();
    expect(serializeMarkdown(editor)).toBe(DOC);
  });

  it('delete of the last block of the document leaves an empty paragraph', () => {
    load('Only block');
    editor.view.dispatch(buildDeleteBlockTransaction(editor.state, posOf(0))!);
    expect(blockTexts()).toEqual(['paragraph']);
    expect(editor.state.doc.textContent).toBe('');
  });

  it('delete of the last of several blocks keeps a valid selection', () => {
    load('One\n\nTwo');
    editor.view.dispatch(buildDeleteBlockTransaction(editor.state, posOf(1))!);
    expect(serializeMarkdown(editor)).toBe('One');
    expect(editor.state.selection.from).toBeLessThanOrEqual(editor.state.doc.content.size);
  });
});

describe('add below ("+")', () => {
  it('inserts a paragraph with "/" after the block and puts the cursor after the "/"', () => {
    load('First\n\n- list\n\nTail');
    editor.view.dispatch(buildInsertSlashBelowTransaction(editor.state, posOf(1))!);
    expect(blockTexts()).toEqual(['paragraph', 'bulletList', 'paragraph', 'paragraph']);
    const { $from } = editor.state.selection;
    expect($from.parent.textContent).toBe('/');
    expect($from.parentOffset).toBe(1);
  });

  it('types the "/" into an empty paragraph instead of adding another one', () => {
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] }, { emitUpdate: false });
    editor.view.dispatch(buildInsertSlashBelowTransaction(editor.state, posOf(0))!);
    expect(blockTexts()).toEqual(['paragraph']);
    expect(editor.state.doc.textContent).toBe('/');
  });
});

// ─── turn into ───────────────────────────────────────────────────────────────

const turnInto = (md: string, target: TurnIntoKind): string => {
  load(md);
  const tr = buildTurnIntoTransaction(editor.state, posOf(0), target);
  expect(tr).not.toBeNull();
  editor.view.dispatch(tr!);
  // `trimEnd`: the trailing node can add an empty paragraph after a last block that is not a paragraph.
  return serializeMarkdown(editor).trimEnd();
};

describe('turn into', () => {
  it('paragraph to every other kind keeps the text', () => {
    expect(turnInto('Hello **world**', 'heading2')).toBe('## Hello **world**');
    expect(turnInto('Hello', 'bulletList')).toBe('- Hello');
    expect(turnInto('Hello', 'orderedList')).toBe('1. Hello');
    expect(turnInto('Hello', 'taskList')).toBe('- [ ] Hello');
    expect(turnInto('Hello', 'blockquote')).toBe('> Hello');
    expect(turnInto('Hello', 'codeBlock')).toBe('```\nHello\n```');
    expect(turnInto('Hello', 'callout')).toBe('> [!NOTE]\n> Hello');
    expect(turnInto('Hello', 'toggle')).toContain('<summary>Hello</summary>');
  });

  it('heading to paragraph and to another level', () => {
    expect(turnInto('# Title', 'paragraph')).toBe('Title');
    expect(turnInto('# Title', 'heading3')).toBe('### Title');
  });

  it('a list gives one paragraph per item, and keeps its items for another list kind', () => {
    expect(turnInto('- one\n- two', 'paragraph')).toBe('one\n\ntwo');
    expect(turnInto('- one\n- two', 'orderedList')).toBe('1. one\n2. two');
    expect(turnInto('- one\n- two', 'taskList')).toBe('- [ ] one\n- [ ] two');
    expect(turnInto('- one\n- two', 'heading1')).toBe('# one\n\n# two');
  });

  it('a nested list item keeps its nested list', () => {
    expect(turnInto('- one\n  - inner\n- two', 'orderedList')).toBe('1. one\n   - inner\n2. two');
  });

  it('a code block gives one paragraph per line', () => {
    expect(turnInto('```\nline 1\nline 2\n```', 'paragraph')).toBe('line 1\n\nline 2');
  });

  it('quote and callout swap, and a callout to a toggle moves the first line to the title', () => {
    expect(turnInto('> one\n>\n> two', 'callout')).toBe('> [!NOTE]\n> one\n>\n> two');
    expect(turnInto('> [!TIP]\n> one', 'blockquote')).toBe('> one');
    expect(turnInto('> [!TIP]\n> one\n>\n> two', 'toggle')).toBe(
      '<details>\n<summary>one</summary>\n\ntwo\n\n</details>'
    );
  });

  it('a toggle gives its title and body back as paragraphs', () => {
    expect(turnInto('<details>\n<summary>Title</summary>\n\nBody\n\n</details>', 'paragraph')).toBe('Title\n\nBody');
  });

  it('a table and a divider cannot be turned into anything', () => {
    ['| A | B |\n| --- | --- |\n| 1 | 2 |', '---'].forEach(md => {
      load(md);
      const node = topLevelBlocks(editor.state.doc)[0].node;
      expect(blockKind(node)).toBeNull();
      expect(TURN_INTO_KINDS.some(kind => canTurnInto(node, kind))).toBe(false);
      expect(buildTurnIntoTransaction(editor.state, posOf(0), 'paragraph')).toBeNull();
    });
  });

  it('the kind a block already is cannot be chosen again', () => {
    load('## Heading');
    const node = topLevelBlocks(editor.state.doc)[0].node;
    expect(canTurnInto(node, 'heading2')).toBe(false);
    expect(canTurnInto(node, 'heading1')).toBe(true);
    expect(buildTurnIntoTransaction(editor.state, posOf(0), 'heading2')).toBeNull();
  });

  it('is one transaction: one undo restores the block', () => {
    load('- one\n- two');
    const before = serializeMarkdown(editor);
    editor.view.dispatch(buildTurnIntoTransaction(editor.state, posOf(0), 'codeBlock')!);
    expect(serializeMarkdown(editor)).not.toBe(before);
    editor.commands.undo();
    expect(serializeMarkdown(editor)).toBe(before);
  });
});
