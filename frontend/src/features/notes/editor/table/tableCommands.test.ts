// @vitest-environment jsdom

/**
 * Tests for the commands of the table controls (colors, clear, insert, delete, move, layout).
 * The editor has the same table extensions as the real one, without the React parts.
 */

import { Editor } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';
import { CellSelection } from '@tiptap/pm/tables';
import StarterKit from '@tiptap/starter-kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { parseMarkdown, serializeMarkdown } from '../markdown';
import { NoteColorMark } from '../noteColor';

import { createNoteTableExtensions } from './noteTable';
import {
  buildClearCellsTransaction,
  buildDeleteLineTransaction,
  buildDeleteTableTransaction,
  buildInsertTransaction,
  buildSelectTransaction,
  buildSetCellColorTransaction,
  buildSetLayoutTransaction,
  canDeleteLine,
  canInsertAt,
  canMoveLine,
  indexAfterMove,
  minRowGap,
  moveTableLine,
  readCommonCellColors,
  readSelectedLines,
  tableSize,
  type TableTarget,
} from './tableCommands';

import type { JSONContent } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';

let editor: Editor;

beforeAll(() => {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      Markdown,
      Link.configure({ openOnClick: false, autolink: true }),
      ...createNoteTableExtensions(),
      NoteColorMark,
    ],
    content: '',
  });
});

afterAll(() => {
  editor?.destroy();
});

/** 3 columns (widths 100/200/300), a header row and two body rows. Some cells have colors. */
const SAMPLE = [
  '<table>',
  '<tr>',
  '<th colwidth="100" data-bg="gray">A</th>',
  '<th colwidth="200">B</th>',
  '<th colwidth="300">C</th>',
  '</tr>',
  '<tr>',
  '<td colwidth="100" data-color="red">a1</td>',
  '<td colwidth="200">b1</td>',
  '<td colwidth="300" data-bg="blue">c1</td>',
  '</tr>',
  '<tr>',
  '<td colwidth="100">a2</td>',
  '<td colwidth="200" data-color="green">b2</td>',
  '<td colwidth="300">c2</td>',
  '</tr>',
  '</table>',
].join('\n');

beforeEach(() => {
  editor.chain().setMeta('addToHistory', false).setContent(parseMarkdown(editor, SAMPLE), { emitUpdate: false }).run();
  // Start with the cursor outside any special selection, like a fresh editor.
  editor.commands.setTextSelection(1);
});

// ─── helpers ────────────────────────────────────────────────────────────────

const tablePos = (): number => {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.type.name === 'table') found = pos;
    return found === -1;
  });
  if (found === -1) throw new Error('no table in the document');
  return found;
};

const column = (index: number): TableTarget => ({ kind: 'column', tablePos: tablePos(), index });
const row = (index: number): TableTarget => ({ kind: 'row', tablePos: tablePos(), index });
const cell = (r: number, c: number): TableTarget => ({ kind: 'cell', tablePos: tablePos(), row: r, col: c });

function run(tr: Transaction | null): void {
  if (!tr) throw new Error('the command returned no transaction');
  editor.view.dispatch(tr);
}

const rowsJson = (): JSONContent[] => {
  const table = editor.getJSON().content?.find(node => node.type === 'table');
  return table?.content ?? [];
};
const grid = (): JSONContent[][] => rowsJson().map(r => r.content ?? []);
const textOf = (c: JSONContent): string =>
  (c.content ?? [])
    .flatMap(p => p.content ?? [])
    .map(n => n.text ?? '')
    .join('');
const texts = (): string[][] => grid().map(r => r.map(textOf));
const attr = (c: JSONContent, key: string): unknown => c.attrs?.[key] ?? null;
const widths = (): unknown[][] => grid().map(r => r.map(c => attr(c, 'colwidth')));

// ─── tests ──────────────────────────────────────────────────────────────────

describe('table commands: color', () => {
  it('sets the text color of a column and keeps the background', () => {
    run(buildSetCellColorTransaction(editor.state, column(0), 'color', 'blue'));
    const cells = grid().map(r => r[0]);
    expect(cells.map(c => attr(c, 'color'))).toEqual(['blue', 'blue', 'blue']);
    expect(attr(cells[0], 'bg')).toBe('gray');
    expect(grid().map(r => attr(r[1], 'color'))).toEqual([null, null, 'green']);
  });

  it('sets the background of a row', () => {
    run(buildSetCellColorTransaction(editor.state, row(1), 'bg', 'yellow'));
    expect(grid()[1].map(c => attr(c, 'bg'))).toEqual(['yellow', 'yellow', 'yellow']);
    expect(attr(grid()[1][0], 'color')).toBe('red');
  });

  it('clears a color with `null` (default)', () => {
    run(buildSetCellColorTransaction(editor.state, row(1), 'color', null));
    expect(attr(grid()[1][0], 'color')).toBeNull();
  });

  it('changes one cell only', () => {
    run(buildSetCellColorTransaction(editor.state, cell(2, 2), 'bg', 'pink'));
    expect(
      grid()
        .flat()
        .filter(c => attr(c, 'bg') === 'pink')
    ).toHaveLength(1);
    expect(attr(grid()[2][2], 'bg')).toBe('pink');
  });

  it('returns no transaction when nothing changes', () => {
    expect(buildSetCellColorTransaction(editor.state, cell(1, 0), 'color', 'red')).toBeNull();
  });

  it('is one undo step', () => {
    run(buildSetCellColorTransaction(editor.state, column(1), 'bg', 'red'));
    editor.commands.undo();
    expect(grid().map(r => attr(r[1], 'bg'))).toEqual([null, null, null]);
  });

  it('reads the common colors of a target', () => {
    expect(readCommonCellColors(editor.state, cell(1, 0))).toEqual({ color: 'red', bg: null });
    expect(readCommonCellColors(editor.state, column(0))).toEqual({ color: undefined, bg: undefined });
    expect(readCommonCellColors(editor.state, row(0))).toEqual({ color: null, bg: undefined });
  });
});

describe('table commands: clear', () => {
  it('empties the cells of a column and keeps cells, widths and colors', () => {
    run(buildClearCellsTransaction(editor.state, column(0)));
    expect(texts().map(r => r[0])).toEqual(['', '', '']);
    expect(texts().map(r => r.slice(1))).toEqual([
      ['B', 'C'],
      ['b1', 'c1'],
      ['b2', 'c2'],
    ]);
    expect(grid().every(r => r.length === 3)).toBe(true);
    expect(grid().map(r => attr(r[0], 'colwidth'))).toEqual([[100], [100], [100]]);
    expect(attr(grid()[1][0], 'color')).toBe('red');
    expect(attr(grid()[0][0], 'bg')).toBe('gray');
  });

  it('empties a row', () => {
    run(buildClearCellsTransaction(editor.state, row(2)));
    expect(texts()[2]).toEqual(['', '', '']);
    expect(texts()[1]).toEqual(['a1', 'b1', 'c1']);
    expect(grid()[0].every(c => c.type === 'tableHeader')).toBe(true);
  });

  it('empties one cell', () => {
    run(buildClearCellsTransaction(editor.state, cell(1, 1)));
    expect(texts()).toEqual([
      ['A', 'B', 'C'],
      ['a1', '', 'c1'],
      ['a2', 'b2', 'c2'],
    ]);
  });

  it('removes every paragraph of a cell, not only the text', () => {
    run(buildClearCellsTransaction(editor.state, cell(1, 0)));
    expect(grid()[1][0].content).toHaveLength(1);
    expect(grid()[1][0].content?.[0].type).toBe('paragraph');
  });

  it('returns no transaction when the target is already empty', () => {
    run(buildClearCellsTransaction(editor.state, cell(1, 1)));
    expect(buildClearCellsTransaction(editor.state, cell(1, 1))).toBeNull();
  });

  it('is one undo step', () => {
    run(buildClearCellsTransaction(editor.state, column(1)));
    editor.commands.undo();
    expect(texts().map(r => r[1])).toEqual(['B', 'b1', 'b2']);
  });
});

describe('table commands: insert', () => {
  it('inserts a column on the left', () => {
    run(buildInsertTransaction(editor.state, tablePos(), 'column', 0));
    expect(texts()).toEqual([
      ['', 'A', 'B', 'C'],
      ['', 'a1', 'b1', 'c1'],
      ['', 'a2', 'b2', 'c2'],
    ]);
    // The other columns keep their width. The new cells have none, and the new header cell is a header.
    expect(widths()[1]).toEqual([null, [100], [200], [300]]);
    expect(grid()[0][0].type).toBe('tableHeader');
    expect(grid()[1][0].type).toBe('tableCell');
  });

  it('inserts a column on the right of column 1 (between columns)', () => {
    run(buildInsertTransaction(editor.state, tablePos(), 'column', 2));
    expect(texts()[0]).toEqual(['A', 'B', '', 'C']);
    expect(widths()[2]).toEqual([[100], [200], null, [300]]);
  });

  it('adds a column at the end', () => {
    const { columns } = tableSize(editor.state, tablePos()) ?? { columns: 0 };
    run(buildInsertTransaction(editor.state, tablePos(), 'column', columns));
    expect(texts()[1]).toEqual(['a1', 'b1', 'c1', '']);
  });

  it('inserts a row below the header row', () => {
    run(buildInsertTransaction(editor.state, tablePos(), 'row', 1));
    expect(texts()).toEqual([
      ['A', 'B', 'C'],
      ['', '', ''],
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
    ]);
    expect(grid()[1].every(c => c.type === 'tableCell')).toBe(true);
    // The new cells have no color. The width of the column is kept.
    expect(grid()[1].map(c => attr(c, 'color'))).toEqual([null, null, null]);
    expect(widths()[1]).toEqual([[100], [200], [300]]);
  });

  it('inserts a row above a body row and adds one at the end', () => {
    run(buildInsertTransaction(editor.state, tablePos(), 'row', 2));
    expect(texts().map(r => r[0])).toEqual(['A', 'a1', '', 'a2']);
    run(buildInsertTransaction(editor.state, tablePos(), 'row', 4));
    expect(texts().map(r => r[0])).toEqual(['A', 'a1', '', 'a2', '']);
  });

  it('refuses to insert a row above the header row', () => {
    expect(canInsertAt(editor.state, tablePos(), 'row', 0)).toBe(false);
    expect(buildInsertTransaction(editor.state, tablePos(), 'row', 0)).toBeNull();
    expect(canInsertAt(editor.state, tablePos(), 'column', 0)).toBe(true);
  });

  it('refuses a gap outside the table', () => {
    expect(buildInsertTransaction(editor.state, tablePos(), 'column', 9)).toBeNull();
    expect(buildInsertTransaction(editor.state, tablePos(), 'row', -1)).toBeNull();
  });

  it('is one undo step', () => {
    run(buildInsertTransaction(editor.state, tablePos(), 'column', 1));
    editor.commands.undo();
    expect(texts()[0]).toEqual(['A', 'B', 'C']);
  });
});

describe('table commands: delete', () => {
  it('deletes a column', () => {
    run(buildDeleteLineTransaction(editor.state, column(1)));
    expect(texts()).toEqual([
      ['A', 'C'],
      ['a1', 'c1'],
      ['a2', 'c2'],
    ]);
    expect(widths()[1]).toEqual([[100], [300]]);
  });

  it('deletes a body row', () => {
    run(buildDeleteLineTransaction(editor.state, row(1)));
    expect(texts()).toEqual([
      ['A', 'B', 'C'],
      ['a2', 'b2', 'c2'],
    ]);
  });

  it('refuses to delete the header row', () => {
    expect(canDeleteLine(editor.state, row(0))).toBe(false);
    expect(buildDeleteLineTransaction(editor.state, row(0))).toBeNull();
  });

  it('refuses to delete the last column or the last row', () => {
    run(buildDeleteLineTransaction(editor.state, column(2)));
    run(buildDeleteLineTransaction(editor.state, column(1)));
    expect(canDeleteLine(editor.state, column(0))).toBe(false);

    run(buildDeleteLineTransaction(editor.state, row(2)));
    expect(canDeleteLine(editor.state, row(1))).toBe(true);
    run(buildDeleteLineTransaction(editor.state, row(1)));
    expect(canDeleteLine(editor.state, row(0))).toBe(false);
  });

  it('keeps a valid selection when the selected column is deleted', () => {
    run(buildSelectTransaction(editor.state, column(1)));
    run(buildDeleteLineTransaction(editor.state, column(1)));
    expect(editor.state.selection).toBeDefined();
    expect(() => editor.state.doc.check()).not.toThrow();
  });

  it('deletes the table and undo brings it back', () => {
    run(buildDeleteTableTransaction(editor.state, tablePos()));
    expect(editor.getJSON().content?.some(n => n.type === 'table')).toBe(false);
    expect(() => editor.state.doc.check()).not.toThrow();

    editor.commands.undo();
    expect(texts()).toHaveLength(3);
    expect(widths()[0]).toEqual([[100], [200], [300]]);
  });
});

describe('table commands: layout', () => {
  it('sets the layout and serializes it', () => {
    run(buildSetLayoutTransaction(editor.state, tablePos(), 'full'));
    expect(serializeMarkdown(editor)).toContain('<table data-layout="full">');
    expect(buildSetLayoutTransaction(editor.state, tablePos(), 'full')).toBeNull();
    run(buildSetLayoutTransaction(editor.state, tablePos(), 'compact'));
    expect(serializeMarkdown(editor)).toContain('<table>');
  });
});

describe('table commands: move', () => {
  it('maps a gap to the index after the move', () => {
    expect([0, 1, 2, 3].map(gap => indexAfterMove(1, gap))).toEqual([0, 1, 1, 2]);
    expect(indexAfterMove(0, 3)).toBe(2);
  });

  it('moves a column with its widths and colors', () => {
    expect(moveTableLine(editor.view, tablePos(), 'column', 0, 3)).toBe(true);
    expect(texts()).toEqual([
      ['B', 'C', 'A'],
      ['b1', 'c1', 'a1'],
      ['b2', 'c2', 'a2'],
    ]);
    expect(widths()[0]).toEqual([[200], [300], [100]]);
    expect(widths()[2]).toEqual([[200], [300], [100]]);
    // Colors travel with the cells.
    expect(attr(grid()[0][2], 'bg')).toBe('gray');
    expect(attr(grid()[1][2], 'color')).toBe('red');
    expect(attr(grid()[1][1], 'bg')).toBe('blue');
    expect(attr(grid()[2][0], 'color')).toBe('green');
    // The header cells are still header cells, the body cells body cells.
    expect(grid()[0].every(c => c.type === 'tableHeader')).toBe(true);
    expect(grid()[1].every(c => c.type === 'tableCell')).toBe(true);
  });

  it('moves a column to the left', () => {
    expect(moveTableLine(editor.view, tablePos(), 'column', 2, 0)).toBe(true);
    expect(texts()[0]).toEqual(['C', 'A', 'B']);
    expect(widths()[1]).toEqual([[300], [100], [200]]);
  });

  it('does nothing when the gap is next to the column', () => {
    expect(moveTableLine(editor.view, tablePos(), 'column', 1, 1)).toBe(false);
    expect(moveTableLine(editor.view, tablePos(), 'column', 1, 2)).toBe(false);
    expect(texts()[0]).toEqual(['A', 'B', 'C']);
  });

  it('moves a body row and keeps the cell attributes', () => {
    expect(moveTableLine(editor.view, tablePos(), 'row', 2, 1)).toBe(true);
    expect(texts()).toEqual([
      ['A', 'B', 'C'],
      ['a2', 'b2', 'c2'],
      ['a1', 'b1', 'c1'],
    ]);
    expect(attr(grid()[1][1], 'color')).toBe('green');
    expect(attr(grid()[2][0], 'color')).toBe('red');
    expect(widths()[1]).toEqual([[100], [200], [300]]);
  });

  it('does not move the header row, and does not drop a row above it', () => {
    expect(canMoveLine(editor.state, tablePos(), 'row', 0)).toBe(false);
    expect(moveTableLine(editor.view, tablePos(), 'row', 0, 3)).toBe(false);
    expect(minRowGap(editor.state, tablePos())).toBe(1);
    expect(moveTableLine(editor.view, tablePos(), 'row', 2, 0)).toBe(false);
    expect(texts()[0]).toEqual(['A', 'B', 'C']);
    expect(grid()[0].every(c => c.type === 'tableHeader')).toBe(true);
  });

  it('undoes a move in one step', () => {
    moveTableLine(editor.view, tablePos(), 'column', 0, 3);
    editor.commands.undo();
    expect(texts()[0]).toEqual(['A', 'B', 'C']);
    expect(widths()[1]).toEqual([[100], [200], [300]]);
  });

  it('keeps the moved line selected', () => {
    moveTableLine(editor.view, tablePos(), 'column', 0, 3);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(readSelectedLines(editor.state)).toMatchObject({ col: 2, wholeColumn: true });
  });

  it('survives a markdown round trip after a move', () => {
    moveTableLine(editor.view, tablePos(), 'column', 0, 3);
    const md = serializeMarkdown(editor);
    expect(md).toContain('<th colwidth="200">B</th>');
    expect(md).toContain('<th colwidth="100" data-bg="gray">A</th>');
  });
});

describe('table commands: selection', () => {
  it('selects a whole column, row or cell', () => {
    run(buildSelectTransaction(editor.state, column(1)));
    expect(readSelectedLines(editor.state)).toMatchObject({ col: 1, row: null, wholeColumn: true, wholeRow: false });

    run(buildSelectTransaction(editor.state, row(2)));
    expect(readSelectedLines(editor.state)).toMatchObject({ row: 2, col: null, wholeRow: true, wholeColumn: false });

    run(buildSelectTransaction(editor.state, cell(1, 2)));
    expect(readSelectedLines(editor.state)).toMatchObject({ row: 1, col: 2, cell: { row: 1, col: 2 } });
  });

  it('reads the cell of a text cursor', () => {
    editor.commands.setTextSelection(tablePos() + 1);
    editor.commands.focus();
    const lines = readSelectedLines(editor.state);
    expect(lines).toMatchObject({ tablePos: tablePos() });
  });

  it('returns null outside a table', () => {
    editor.commands.insertContentAt(0, '<p>before</p>');
    editor.commands.setTextSelection(1);
    expect(readSelectedLines(editor.state)).toBeNull();
  });
});
