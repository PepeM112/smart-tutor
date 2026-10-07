// @vitest-environment jsdom

// Tests of the block-specific menu sections: which sections a node type gets, and what their actions do.
// Same light editor as `blockCommands.test.ts` (the real extensions, no React).

import { Editor } from '@tiptap/core';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { NoteCallout } from '../callout/noteCallout';
import { isCodeWrapped, NoteCodeWrap } from '../codeBlockWrap';
import { NoteLink } from '../link/noteLink';
import { parseMarkdown, serializeMarkdown } from '../markdown';
import { NoteCodeBlock } from '../noteCodeBlock';
import { NoteColorMark } from '../noteColor';
import { createNoteTableExtensions } from '../table/noteTable';
import { tableSize } from '../table/tableCommands';
import { NoteToggle, NoteToggleSummary } from '../toggle/noteToggle';

import { getBlockSections, hasTurnInto, type BlockAction, type BlockSection } from './blockActions';
import { topLevelBlocks } from './blockCommands';

import type { EditorState, Transaction } from '@tiptap/pm/state';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const editor = new Editor({
  extensions: [
    StarterKit.configure({ codeBlock: false, heading: { levels: [1, 2, 3] }, link: false }),
    Markdown,
    NoteLink.configure({ openOnClick: false, autolink: true }),
    ...createNoteTableExtensions(),
    TaskList,
    TaskItem.configure({ nested: true }),
    NoteCodeBlock.configure({ lowlight: createLowlight(common) }),
    NoteCodeWrap,
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

afterEach(() => {
  vi.clearAllMocks();
});

// ─── helpers ─────────────────────────────────────────────────────────────────

const load = (md: string): void => {
  editor.chain().setMeta('addToHistory', false).setContent(parseMarkdown(editor, md), { emitUpdate: false }).run();
};

const run = (build: (state: EditorState) => Transaction | null): void => {
  const tr = build(editor.state);
  if (tr) editor.view.dispatch(tr);
};

/** The sections of the first block of the document, as the menu would get them. */
const sectionsOfFirstBlock = (): BlockSection[] => {
  const { node, pos } = topLevelBlocks(editor.state.doc)[0];
  return getBlockSections({ editor, node, pos, run, t: key => key });
};

const actionIds = (section: BlockSection): string[] => section.actions.map(action => action.id);

const findAction = <T extends BlockAction['type']>(
  section: BlockSection,
  id: string,
  type: T
): Extract<BlockAction, { type: T }> => {
  const action = section.actions.find(a => a.id === id);
  if (action?.type !== type) throw new Error(`No ${type} action "${id}"`);
  return action as Extract<BlockAction, { type: T }>;
};

const TABLE_MD = '| A | B |\n| --- | --- |\n| 1 | 2 |';

// ─── which sections ──────────────────────────────────────────────────────────

describe('getBlockSections', () => {
  it.each([
    ['a paragraph', 'Text'],
    ['a heading', '## Title'],
    ['a list', '- one\n- two'],
    ['a quote', '> quote'],
    ['a divider', '---'],
    ['a toggle', '<details>\n<summary>T</summary>\n\nBody\n\n</details>'],
  ])('gives no section for %s (only the common group)', (_name, md) => {
    load(md);
    expect(sectionsOfFirstBlock()).toEqual([]);
  });

  it('gives the table section: full width, add row, add column', () => {
    load(TABLE_MD);
    const sections = sectionsOfFirstBlock();
    expect(sections.map(s => s.id)).toEqual(['table']);
    expect(actionIds(sections[0])).toEqual(['full-width', 'add-row', 'add-column']);
  });

  it('gives the code section: copy, wrap', () => {
    load('```python\nprint(1)\n```');
    const sections = sectionsOfFirstBlock();
    expect(sections.map(s => s.id)).toEqual(['code']);
    expect(actionIds(sections[0])).toEqual(['copy', 'wrap']);
  });

  it('gives the callout section: one type submenu with the five types', () => {
    load('> [!WARNING]\n> Careful');
    const [section] = sectionsOfFirstBlock();
    expect(section.id).toBe('callout');
    const submenu = findAction(section, 'callout-type', 'submenu');
    expect(submenu.options.map(o => o.id)).toEqual(['note', 'tip', 'important', 'warning', 'caution']);
    expect(submenu.options.filter(o => o.checked).map(o => o.id)).toEqual(['warning']);
  });
});

describe('hasTurnInto', () => {
  it('hides "Turn into" for a table and a divider, and shows it for text blocks', () => {
    const result = [TABLE_MD, '---', 'Text', '## Title', '```js\n1\n```', '> [!TIP]\n> x'].map(md => {
      load(md);
      return hasTurnInto(topLevelBlocks(editor.state.doc)[0].node);
    });
    expect(result).toEqual([false, false, true, true, true, true]);
  });
});

// ─── table actions ───────────────────────────────────────────────────────────

describe('table actions', () => {
  it('full width is a toggle that sets the layout and shows the current one', () => {
    load(TABLE_MD);
    const before = findAction(sectionsOfFirstBlock()[0], 'full-width', 'toggle');
    expect(before.checked).toBe(false);

    before.onCheckedChange(true);
    expect(serializeMarkdown(editor)).toContain('data-layout="full"');
    expect(findAction(sectionsOfFirstBlock()[0], 'full-width', 'toggle').checked).toBe(true);

    findAction(sectionsOfFirstBlock()[0], 'full-width', 'toggle').onCheckedChange(false);
    expect(serializeMarkdown(editor)).not.toContain('data-layout');
  });

  it('add row and add column append at the end', () => {
    load(TABLE_MD);
    const pos = topLevelBlocks(editor.state.doc)[0].pos;
    expect(tableSize(editor.state, pos)).toEqual({ rows: 2, columns: 2 });

    findAction(sectionsOfFirstBlock()[0], 'add-row', 'item').onSelect();
    expect(tableSize(editor.state, pos)).toEqual({ rows: 3, columns: 2 });

    findAction(sectionsOfFirstBlock()[0], 'add-column', 'item').onSelect();
    expect(tableSize(editor.state, pos)).toEqual({ rows: 3, columns: 3 });
  });
});

// ─── code actions ────────────────────────────────────────────────────────────

describe('code actions', () => {
  const CODE = '```python\nprint(1)\n```';

  it('wrap toggles the view-only state and never changes the Markdown', () => {
    load(CODE);
    const markdown = serializeMarkdown(editor);
    const pos = topLevelBlocks(editor.state.doc)[0].pos;

    findAction(sectionsOfFirstBlock()[0], 'wrap', 'toggle').onCheckedChange(true);
    expect(isCodeWrapped(editor.state, pos)).toBe(true);
    expect(findAction(sectionsOfFirstBlock()[0], 'wrap', 'toggle').checked).toBe(true);
    expect(serializeMarkdown(editor)).toBe(markdown);

    findAction(sectionsOfFirstBlock()[0], 'wrap', 'toggle').onCheckedChange(false);
    expect(isCodeWrapped(editor.state, pos)).toBe(false);
  });

  it('copy writes the raw code to the clipboard and shows a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    load(CODE);

    findAction(sectionsOfFirstBlock()[0], 'copy', 'item').onSelect();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('code_copied'));
    expect(writeText).toHaveBeenCalledWith('print(1)');
    vi.unstubAllGlobals();
  });
});

// ─── callout actions ─────────────────────────────────────────────────────────

describe('callout actions', () => {
  it('selecting a type changes the callout and the Markdown marker', () => {
    load('> [!NOTE]\n> Text');
    const submenu = findAction(sectionsOfFirstBlock()[0], 'callout-type', 'submenu');
    submenu.options.find(o => o.id === 'caution')?.onSelect();

    expect(serializeMarkdown(editor)).toContain('[!CAUTION]');
    const after = findAction(sectionsOfFirstBlock()[0], 'callout-type', 'submenu');
    expect(after.options.filter(o => o.checked).map(o => o.id)).toEqual(['caution']);
  });
});
