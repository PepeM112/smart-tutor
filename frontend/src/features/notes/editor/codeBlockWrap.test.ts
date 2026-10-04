// @vitest-environment jsdom

// Tests of the "wrap lines" plugin: the state is outside the document, follows the block through edits,
// and never reaches the saved Markdown.

import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { afterAll, describe, expect, it } from 'vitest';

import {
  buildToggleCodeWrapTransaction,
  isCodeWrapped,
  codeWrapKey,
  mapWrapPositions,
  NoteCodeWrap,
  toggleWrapPosition,
} from './codeBlockWrap';
import { createNoteExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown } from './markdown';
import { NoteCodeBlock } from './noteCodeBlock';

const editor = new Editor({
  extensions: [
    StarterKit.configure({ codeBlock: false, link: false }),
    Markdown,
    NoteCodeBlock.configure({ lowlight: createLowlight(common) }),
    NoteCodeWrap,
  ],
  content: '',
});

afterAll(() => {
  editor.destroy();
});

const load = (md: string): void => {
  editor.chain().setMeta('addToHistory', false).setContent(parseMarkdown(editor, md), { emitUpdate: false }).run();
};

/** Positions of the blocks of one type. */
const positionsOf = (type: string): number[] => {
  const found: number[] = [];
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === type) found.push(pos);
  });
  return found;
};

const toggle = (pos: number): void => {
  const tr = buildToggleCodeWrapTransaction(editor.state, pos);
  if (tr) editor.view.dispatch(tr);
};

const DOC = 'Intro\n\n```js\nconst a = 1;\n```\n\n```py\nprint(1)\n```';

describe('toggleWrapPosition', () => {
  it('adds a missing position and removes a present one, sorted', () => {
    expect(toggleWrapPosition([5, 20], 10)).toEqual([5, 10, 20]);
    expect(toggleWrapPosition([5, 10, 20], 10)).toEqual([5, 20]);
  });
});

describe('code wrap plugin', () => {
  it('toggles per block, and not for a block that is not code', () => {
    load(DOC);
    const [first, second] = positionsOf('codeBlock');
    expect(buildToggleCodeWrapTransaction(editor.state, 0)).toBeNull();

    toggle(first);
    expect(isCodeWrapped(editor.state, first)).toBe(true);
    expect(isCodeWrapped(editor.state, second)).toBe(false);

    toggle(first);
    expect(isCodeWrapped(editor.state, first)).toBe(false);
  });

  it('is not part of the document: no doc change, no Markdown change', () => {
    load(DOC);
    const markdown = serializeMarkdown(editor);
    const before = editor.state.doc;

    toggle(positionsOf('codeBlock')[0]);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(serializeMarkdown(editor)).toBe(markdown);
  });

  it('follows the block when text is typed above it', () => {
    load(DOC);
    toggle(positionsOf('codeBlock')[0]);

    editor.view.dispatch(editor.state.tr.insertText('More ', 1));
    const [moved] = positionsOf('codeBlock');
    expect(isCodeWrapped(editor.state, moved)).toBe(true);
  });

  it('drops the setting when the block is deleted', () => {
    load(DOC);
    const [first] = positionsOf('codeBlock');
    toggle(first);

    const node = editor.state.doc.nodeAt(first)!;
    editor.view.dispatch(editor.state.tr.delete(first, first + node.nodeSize));
    expect(positionsOf('codeBlock').some(pos => isCodeWrapped(editor.state, pos))).toBe(false);
  });
});

describe('mapWrapPositions', () => {
  it('keeps the list when the document did not change', () => {
    load(DOC);
    expect(mapWrapPositions([3, 9], editor.state.tr)).toEqual([3, 9]);
  });
});

describe('real extension list', () => {
  // Regression: the `extend()` chain of the code block added its plugins more than once: the keyed wrap
  // plugin threw, and the lowlight plugin was added 3 times (see `noteCodeBlock.ts` and `codeBlockWrap.ts`).
  it('creates the editor with one wrap plugin and one lowlight plugin', () => {
    const real = new Editor({ extensions: createNoteExtensions(), content: '' });
    // `Plugin.key` is the unique key string ("lowlight$", "lowlight$1", ...). It is not in the public type.
    const keyOf = (plugin: unknown): string => (plugin as { key: string }).key;
    try {
      expect(real.state.plugins.filter(plugin => plugin.spec.key === codeWrapKey)).toHaveLength(1);
      expect(real.state.plugins.filter(plugin => keyOf(plugin).startsWith('lowlight$'))).toHaveLength(1);
    } finally {
      real.destroy();
    }
  });
});
