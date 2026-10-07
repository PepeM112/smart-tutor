// @vitest-environment jsdom

// A real Tiptap editor: heading ids are in the DOM, the outline list matches them, and the saved
// Markdown is the same with and without the anchors plugin.

import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { parseMarkdown, serializeMarkdown } from '../markdown';

import { HeadingAnchors } from './headingAnchors';
import { collectHeadings } from './headings';
import { findHeadingElement, queryHeadingElements } from './scroll';
import { pickActiveId } from './useHeadingOutline';

import type { AnyExtension } from '@tiptap/core';

const NOTE = `# Title

Intro text.

## Setup

- item

## Setup

### Café & Crème

\`\`\`python
# not a heading
\`\`\`
`;

const editors: Editor[] = [];

function createEditor(markdown: string, withAnchors: boolean): Editor {
  const extensions: AnyExtension[] = [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Markdown,
    ...(withAnchors ? [HeadingAnchors] : []),
  ];
  const editor = new Editor({ element: document.createElement('div'), extensions, content: '' });
  editors.push(editor);
  editor.commands.setContent(parseMarkdown(editor, markdown), { emitUpdate: false });
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor.destroy());
});

describe('collectHeadings', () => {
  it('lists headings in order with level, text and unique ids', () => {
    const editor = createEditor(NOTE, true);
    const headings = collectHeadings(editor.state.doc);
    expect(headings.map(h => [h.level, h.text, h.id])).toEqual([
      [1, 'Title', 'title'],
      [2, 'Setup', 'setup'],
      [2, 'Setup', 'setup-2'],
      [3, 'Café & Crème', 'cafe-creme'],
    ]);
  });

  it('gives positions that point at the heading nodes', () => {
    const editor = createEditor(NOTE, true);
    collectHeadings(editor.state.doc).forEach(heading => {
      expect(editor.state.doc.nodeAt(heading.pos)?.type.name).toBe('heading');
    });
  });

  it('is empty for a note with no headings', () => {
    expect(collectHeadings(createEditor('Just text.', true).state.doc)).toEqual([]);
  });
});

describe('HeadingAnchors', () => {
  it('sets the slug id on each heading element', () => {
    const editor = createEditor(NOTE, true);
    expect(queryHeadingElements(editor.view.dom).map(el => el.id)).toEqual(['title', 'setup', 'setup-2', 'cafe-creme']);
    expect(findHeadingElement(editor.view.dom, 'setup-2')?.textContent).toBe('Setup');
  });

  it('updates the ids when the document changes', () => {
    const editor = createEditor('## One\n\n## Two\n', true);
    editor.commands.setContent(parseMarkdown(editor, '## Two\n\n## One\n\n## One\n'), { emitUpdate: false });
    expect(queryHeadingElements(editor.view.dom).map(el => [el.id, el.textContent])).toEqual([
      ['two', 'Two'],
      ['one', 'One'],
      ['one-2', 'One'],
    ]);
  });

  it('does not change the saved Markdown', () => {
    const plain = serializeMarkdown(createEditor(NOTE, false));
    const anchored = serializeMarkdown(createEditor(NOTE, true));
    expect(anchored).toBe(plain);
    expect(anchored).not.toContain('{#');
    expect(anchored).not.toContain('id=');
  });
});

describe('pickActiveId', () => {
  const tops = [
    { id: 'a', top: -300 },
    { id: 'b', top: 40 },
    { id: 'c', top: 400 },
  ];

  it('picks the last heading that is above the threshold', () => {
    expect(pickActiveId(tops, 96)).toBe('b');
  });

  it('picks the first heading before the first one is reached', () => {
    expect(pickActiveId([{ id: 'a', top: 500 }], 96)).toBe('a');
  });

  it('returns null with no headings', () => {
    expect(pickActiveId([], 96)).toBeNull();
  });
});
