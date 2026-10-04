// Table → HTML serializer for the note markdown.
//
// Tables are always saved as HTML, because GFM pipe tables cannot hold column widths,
// colors, the layout or several paragraphs in a cell:
//
//   <table data-layout="full">
//   <tr>
//   <th colwidth="120" data-bg="gray">Name</th>
//   <th>Score</th>
//   </tr>
//   <tr>
//   <td data-color="red"><strong>Alice</strong></td>
//   <td></td>
//   </tr>
//   </table>
//
// Rules:
// - Default attributes are omitted (`data-layout="compact"`, `colspan="1"`, no color).
// - Cell content is saved as inline HTML, not as markdown. A markdown HTML block ends at the first
//   blank line, and markdown inside a cell would need a blank line between two paragraphs.
//   HTML keeps every mark (bold, links, code, color spans) and several paragraphs or lists per cell.
//   The HTML is built with the schema's own `toDOM`, so the browser escapes `<`, `>` and `&`.
// - A cell with one paragraph is written without the <p> wrapper, an empty cell as `<td></td>`.
// - The output never has a blank line (a blank line inside a <pre> becomes `&#10;`).
//
// Loading is the reverse: the markdown parser reads the HTML block and each element goes through
// the `parseHTML` rule of its node or mark (`parseColwidth`, the color attributes, …).

import { DOMSerializer, Fragment, type Schema } from '@tiptap/pm/model';

import { DEFAULT_TABLE_LAYOUT, parseCellColor, parseTableLayout } from './tableAttributes';

import type { JSONContent } from '@tiptap/core';

type Attrs = Record<string, unknown>;

const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain-text fallback for when there is no schema/DOM. Loses marks, keeps the words. */
function textOf(node: JSONContent): string {
  return node.text ?? (node.content ?? []).map(textOf).join(node.type === 'paragraph' ? '' : ' ');
}

function fragmentToHtml(nodes: JSONContent[], schema: Schema | null): string {
  if (!schema || typeof document === 'undefined') return escapeText(nodes.map(textOf).join(' '));
  try {
    const container = document.createElement('div');
    container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(Fragment.fromJSON(schema, nodes)));
    // The Link mark adds target/rel/class on render. They are the mark defaults and are restored on load.
    container.querySelectorAll('a').forEach(link => {
      ['target', 'rel', 'class'].forEach(name => link.removeAttribute(name));
    });
    // A blank line would end the HTML block. Only code blocks can contain one.
    return container.innerHTML.replace(/\n[ \t]*(?=\n)/g, '&#10;');
  } catch {
    return escapeText(nodes.map(textOf).join(' '));
  }
}

function cellContentToHtml(cell: JSONContent, schema: Schema | null): string {
  const blocks = cell.content ?? [];
  const [first] = blocks;
  if (blocks.length === 1 && first.type === 'paragraph') return fragmentToHtml(first.content ?? [], schema);
  return fragmentToHtml(blocks, schema);
}

function cellAttributesToHtml(attrs: Attrs): string {
  const colspan = Number(attrs.colspan ?? 1);
  const rowspan = Number(attrs.rowspan ?? 1);
  const widths = Array.isArray(attrs.colwidth) ? (attrs.colwidth as number[]) : [];
  const align = attrs.align === 'left' || attrs.align === 'center' || attrs.align === 'right' ? attrs.align : null;
  const color = parseCellColor((attrs.color as string | null | undefined) ?? null);
  const bg = parseCellColor((attrs.bg as string | null | undefined) ?? null);

  return [
    colspan > 1 && `colspan="${colspan}"`,
    rowspan > 1 && `rowspan="${rowspan}"`,
    widths.some(width => width > 0) && `colwidth="${widths.join(',')}"`,
    align && `align="${align}"`,
    color && `data-color="${color}"`,
    bg && `data-bg="${bg}"`,
  ]
    .filter((part): part is string => typeof part === 'string')
    .map(part => ` ${part}`)
    .join('');
}

/**
 * Serialize a `table` node (Tiptap JSON) to the HTML form described at the top of this file.
 * `schema` is the editor schema. It is only used to render the cell content.
 */
export function renderTableAsHtml(table: JSONContent, schema: Schema | null): string {
  const layout = parseTableLayout(table.attrs?.layout);
  const open = layout === DEFAULT_TABLE_LAYOUT ? '<table>' : `<table data-layout="${layout}">`;

  const rows = (table.content ?? []).map(row => {
    const cells = (row.content ?? []).map(cell => {
      const tag = cell.type === 'tableHeader' ? 'th' : 'td';
      return `<${tag}${cellAttributesToHtml(cell.attrs ?? {})}>${cellContentToHtml(cell, schema)}</${tag}>`;
    });
    return ['<tr>', ...cells, '</tr>'].join('\n');
  });

  return [open, ...rows, '</table>'].join('\n');
}
