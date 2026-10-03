// @vitest-environment jsdom

/**
 * Tests for the table storage format (HTML in the markdown) and the column width reset.
 * The editor has the same table, mark and markdown extensions as the real one, without React parts.
 */

import { Editor } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseMarkdown, serializeMarkdown } from '../markdown';
import { NoteColorMark } from '../noteColor';

import { createNoteTableExtensions } from './noteTable';
import { buildResetColumnWidthTransaction } from './resetColumnWidth';

import type { JSONContent } from '@tiptap/core';

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

/** Like the real editor on mount: loading is not an undo step. */
function load(md: string): void {
  editor.chain().setMeta('addToHistory', false).setContent(parseMarkdown(editor, md), { emitUpdate: false }).run();
}

/** Load + save. `trimEnd`: StarterKit adds an empty trailing paragraph after a last table. */
function roundTrip(md: string): string {
  load(md);
  return serializeMarkdown(editor).trimEnd();
}

function expectStable(md: string): string {
  const once = roundTrip(md);
  expect(roundTrip(once)).toBe(once);
  return once;
}

/** The first table of the current document, as JSON. */
function firstTable(): JSONContent {
  const table = editor.getJSON().content?.find(node => node.type === 'table');
  if (!table) throw new Error('no table in the document');
  return table;
}

const cellsOf = (table: JSONContent): JSONContent[] => (table.content ?? []).flatMap(row => row.content ?? []);
const widthsOf = (table: JSONContent): (number[] | null)[] =>
  cellsOf(table).map((cell): number[] | null => (cell.attrs?.colwidth as number[] | null | undefined) ?? null);
const textOfCell = (cell: JSONContent): string =>
  (cell.content ?? [])
    .flatMap(p => p.content ?? [])
    .map(n => n.text ?? '')
    .join('');

describe('table: loading', () => {
  it('loads an old GFM pipe table', () => {
    load('| Name | Score |\n| ---- | ----- |\n| Alice | 95 |\n| Bob | 87 |');
    const table = firstTable();
    expect(table.attrs?.layout).toBe('compact');
    expect(table.content).toHaveLength(3);
    expect(cellsOf(table).map(textOfCell)).toEqual(['Name', 'Score', 'Alice', '95', 'Bob', '87']);
    expect(table.content?.[0].content?.[0].type).toBe('tableHeader');
    expect(table.content?.[1].content?.[0].type).toBe('tableCell');
  });

  it('writes a pipe table as HTML on the first save', () => {
    const out = roundTrip('| A | B |\n| - | - |\n| 1 | 2 |');
    expect(out).toBe('<table>\n<tr>\n<th>A</th>\n<th>B</th>\n</tr>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</table>');
    expect(out).not.toContain('|');
  });

  it('keeps the column alignment of a pipe table', () => {
    const out = roundTrip('| A | B |\n| :-: | --: |\n| 1 | 2 |');
    expect(out).toContain('<th align="center">A</th>');
    expect(out).toContain('<th align="right">B</th>');
    expectStable(out);
  });

  it('loads an HTML table with all attributes', () => {
    load(
      [
        '<table data-layout="full">',
        '<tr>',
        '<th colwidth="120" data-bg="gray">Name</th>',
        '<th colwidth="80">Score</th>',
        '</tr>',
        '<tr>',
        '<td colwidth="120" data-color="red" data-bg="yellow">Alice</td>',
        '<td colwidth="80">95</td>',
        '</tr>',
        '</table>',
      ].join('\n')
    );
    const table = firstTable();
    const [name, score, alice, ninetyFive] = cellsOf(table);
    expect(table.attrs?.layout).toBe('full');
    expect(name.attrs).toMatchObject({ colwidth: [120], bg: 'gray', color: null });
    expect(score.attrs).toMatchObject({ colwidth: [80], bg: null });
    expect(alice.attrs).toMatchObject({ color: 'red', bg: 'yellow' });
    expect(ninetyFive.attrs).toMatchObject({ colwidth: [80] });
  });

  it('repairs a column whose cells have different widths', () => {
    // prosemirror-tables (fixTables) copies the known width to the other cells of the column.
    load('<table>\n<tr>\n<td colwidth="90">a</td>\n</tr>\n<tr>\n<td>b</td>\n</tr>\n</table>');
    expect(widthsOf(firstTable())).toEqual([[90], [90]]);
  });

  it('ignores unknown colors and layouts', () => {
    load('<table data-layout="huge">\n<tr>\n<td data-color="neon" data-bg="#fff">x</td>\n</tr>\n</table>');
    const table = firstTable();
    expect(table.attrs?.layout).toBe('compact');
    expect(cellsOf(table)[0].attrs).toMatchObject({ color: null, bg: null });
  });
});

describe('table: HTML round-trip', () => {
  const full = [
    '<table data-layout="full">',
    '<tr>',
    '<th colwidth="120" data-bg="gray">Name</th>',
    '<th colwidth="80" data-color="blue">Score</th>',
    '</tr>',
    '<tr>',
    '<td colwidth="120" data-color="red" data-bg="yellow">Alice</td>',
    '<td colwidth="80">95</td>',
    '</tr>',
    '</table>',
  ].join('\n');

  it('keeps layout, colwidth and colors byte for byte', () => {
    expect(roundTrip(full)).toBe(full);
  });

  it('omits the default attributes', () => {
    const out = roundTrip(full.replace(' data-layout="full"', ' data-layout="compact"'));
    expect(out.startsWith('<table>\n')).toBe(true);
    expect(out).not.toContain('colspan');
    expect(out).not.toContain('colwidth="null"');
  });

  it('keeps a table between other blocks', () => {
    const md = `# Title\n\nBefore.\n\n${full}\n\nAfter.`;
    expect(roundTrip(md)).toBe(md);
  });

  it('keeps bold, italic, strike, code, link and color marks inside a cell', () => {
    const md = [
      '<table>',
      '<tr>',
      '<th>Mixed</th>',
      '</tr>',
      '<tr>',
      '<td><strong>bold</strong> <em>it</em> <s>gone</s> <code>x()</code> <a href="https://example.com">site</a> <span data-color="red">red</span> <strong><span data-bg="green">both</span></strong></td>',
      '</tr>',
      '</table>',
    ].join('\n');
    const out = expectStable(md);
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>it</em>');
    expect(out).toContain('<s>gone</s>');
    expect(out).toContain('<code>x()</code>');
    expect(out).toContain('<a href="https://example.com">site</a>');
    expect(out).toContain('<span data-color="red">red</span>');
    expect(out).toContain('data-bg="green"');

    load(out);
    const cell = cellsOf(firstTable())[1];
    const marksByText = Object.fromEntries<string[]>(
      (cell.content?.[0].content ?? []).map((node): [string, string[]] => [
        node.text ?? '',
        (node.marks ?? []).map(mark => mark.type),
      ])
    );
    expect(marksByText['bold']).toContain('bold');
    expect(marksByText['site']).toContain('link');
    expect(marksByText['red']).toContain('noteColor');
    expect(marksByText['both']).toEqual(expect.arrayContaining(['bold', 'noteColor']));
  });

  it('does not write the Link mark defaults (target, rel, class)', () => {
    const out = roundTrip('<table>\n<tr>\n<td><a href="https://example.com">site</a></td>\n</tr>\n</table>');
    expect(out).not.toContain('target=');
    expect(out).not.toContain('rel=');
    expect(out).not.toContain('class=');
  });

  it('keeps cells with several paragraphs', () => {
    const md = '<table>\n<tr>\n<td><p>first</p><p>second <strong>b</strong></p></td>\n</tr>\n</table>';
    expect(roundTrip(md)).toBe(md);
    const cell = cellsOf(firstTable())[0];
    expect(cell.content).toHaveLength(2);
  });

  it('keeps lists and code blocks inside a cell', () => {
    const md = [
      '<table>',
      '<tr>',
      '<td><ul><li><p>one</p></li><li><p>two</p></li></ul></td>',
      '<td><pre><code class="language-ts">const a = 1;&#10;&#10;const b = 2;</code></pre></td>',
      '</tr>',
      '</table>',
    ].join('\n');
    const out = expectStable(md);
    expect(out.split('\n').some(line => line.trim() === '')).toBe(false);
    const [list, code] = cellsOf(firstTable());
    expect(list.content?.[0].type).toBe('bulletList');
    expect(code.content?.[0].type).toBe('codeBlock');
    expect(code.content?.[0].content?.[0].text).toBe('const a = 1;\n\nconst b = 2;');
  });

  it('keeps empty cells as <td></td>', () => {
    const md =
      '<table>\n<tr>\n<th>A</th>\n<th></th>\n</tr>\n<tr>\n<td></td>\n<td data-bg="blue"></td>\n</tr>\n</table>';
    expect(roundTrip(md)).toBe(md);
    const cells = cellsOf(firstTable());
    expect(cells).toHaveLength(4);
    expect(cells.map(textOfCell)).toEqual(['A', '', '', '']);
  });

  it('escapes < > & and keeps | as text', () => {
    const md = '<table>\n<tr>\n<td>a &lt; b &amp;&amp; c &gt; d | e || f &lt;div&gt;</td>\n</tr>\n</table>';
    const out = expectStable(md);
    expect(out).toBe(md);
    expect(textOfCell(cellsOf(firstTable())[0])).toBe('a < b && c > d | e || f <div>');
  });

  it('escapes < and | typed as text in a pipe table cell', () => {
    // `\|` is the GFM escape for a literal pipe in a cell.
    const out = roundTrip('| A |\n| - |\n| x \\| y &lt; z |');
    expect(out).toContain('<td>x | y &lt; z</td>');
    expectStable(out);
  });

  it('keeps colspan and rowspan', () => {
    const md =
      '<table>\n<tr>\n<td colspan="2" colwidth="100,0">a</td>\n</tr>\n<tr>\n<td colwidth="100">b</td>\n<td>c</td>\n</tr>\n</table>';
    expect(roundTrip(md)).toBe(md);
  });

  it('serializes a table next to other blocks without a blank line inside', () => {
    const out = roundTrip('| A | B |\n| - | - |\n| 1 | 2 |\n\nText after.');
    expect(out.split('\n\n')).toHaveLength(2);
    expect(out.endsWith('Text after.')).toBe(true);
  });
});

describe('table: reset column width', () => {
  const sized = [
    '<table>',
    '<tr>',
    '<th colwidth="120">A</th>',
    '<th colwidth="200">B</th>',
    '</tr>',
    '<tr>',
    '<td colwidth="120">1</td>',
    '<td colwidth="200">2</td>',
    '</tr>',
    '</table>',
  ].join('\n');

  /** Document position of the n-th cell (0-based, in document order). */
  function cellPos(index: number): number {
    const positions: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') positions.push(pos);
    });
    return positions[index];
  }

  it('clears the width in every cell of the column, in one transaction', () => {
    load(sized);
    const tr = buildResetColumnWidthTransaction(editor.state, cellPos(0));
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);

    const widths = widthsOf(firstTable());
    expect(widths).toEqual([null, [200], null, [200]]);
    expect(serializeMarkdown(editor)).toContain('<th>A</th>');
    expect(serializeMarkdown(editor)).toContain('<th colwidth="200">B</th>');
  });

  it('returns null when the column has no width', () => {
    load('<table>\n<tr>\n<td>a</td>\n<td colwidth="90">b</td>\n</tr>\n</table>');
    expect(buildResetColumnWidthTransaction(editor.state, cellPos(0))).toBeNull();
  });

  it('can be undone as one step', () => {
    load(sized);
    editor.view.dispatch(buildResetColumnWidthTransaction(editor.state, cellPos(1))!);
    expect(widthsOf(firstTable())).toEqual([[120], null, [120], null]);
    editor.commands.undo();
    expect(widthsOf(firstTable())).toEqual([[120], [200], [120], [200]]);
  });
});

describe('table: rendering', () => {
  const html = '<table data-layout="full">\n<tr>\n<th colwidth="120">A</th>\n<th colwidth="80">B</th>\n</tr>\n</table>';

  const hasResizePlugin = (target: Editor): boolean =>
    target.state.plugins.some(plugin => (plugin as unknown as { key: string }).key.includes('tableColumnResizing'));

  it('sets data-layout on the <table> and the widths on the <col> elements (editable)', () => {
    load(html);
    const dom = editor.view.dom;
    expect(dom.querySelector('table')?.getAttribute('data-layout')).toBe('full');
    expect(Array.from(dom.querySelectorAll('col')).map(col => col.style.width)).toEqual(['120px', '80px']);
  });

  it('adds the resize plugin when editable', () => {
    expect(hasResizePlugin(editor)).toBe(true);
  });

  it('read-only: renders layout and widths, has no resize plugin', () => {
    const readOnly = new Editor({
      editable: false,
      extensions: [StarterKit.configure({ link: false }), Markdown, ...createNoteTableExtensions(), NoteColorMark],
      content: '',
    });
    readOnly.commands.setContent(parseMarkdown(readOnly, html), { emitUpdate: false });
    const dom = readOnly.view.dom;
    expect(dom.querySelector('table')?.getAttribute('data-layout')).toBe('full');
    expect(Array.from(dom.querySelectorAll('col')).map(col => col.style.width)).toEqual(['120px', '80px']);
    expect(hasResizePlugin(readOnly)).toBe(false);
    readOnly.destroy();
  });
});
