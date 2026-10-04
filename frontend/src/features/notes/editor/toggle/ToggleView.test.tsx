// @vitest-environment jsdom

// Toggle block in a real editor with the real NodeView:
// - the DOM structure that `note-editor.css` depends on (Tiptap puts the blocks in a
//   `[data-node-view-content-react]` element inside `.note-toggle-body`, so the CSS must name it),
// - the collapse rule of that CSS (jsdom applies the style sheet, but it has no layout),
// - Enter in the summary, and when the toggle opens.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createNoteExtensions } from '../extensions';
import { scrollToHeading } from '../outline/scroll';

import type { JSONContent } from '@tiptap/core';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const text = (value: string): JSONContent => ({ type: 'text', text: value });
const paragraph = (value: string): JSONContent => ({ type: 'paragraph', content: [text(value)] });

// A toggle with a summary, a list and a heading, then a paragraph.
const DOC: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'toggle',
      content: [
        { type: 'toggleSummary', content: [text('Title')] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('item')] }] },
        { type: 'heading', attrs: { level: 2 }, content: [text('Deep')] },
      ],
    },
    paragraph('After'),
  ],
};

// One list for all renders: `useEditor` compares the extensions by identity.
const EXTENSIONS = createNoteExtensions({ headingAnchors: true });

let editor: Editor | null = null;

function Harness() {
  const instance = useEditor({
    extensions: EXTENSIONS,
    content: DOC,
    immediatelyRender: true,
    // A callback, not the render body: the tests read the editor from outside of the component.
    onCreate: ({ editor: created }) => {
      editor = created;
    },
  });
  return <EditorContent editor={instance} className="note-editor-content" />;
}

const getEditor = (): Editor => {
  if (!editor) throw new Error('The editor is not ready.');
  return editor;
};

/** The NodeView is rendered in a React portal after the editor mounts, so wait for its chevron button. */
const renderEditor = async (): Promise<HTMLElement> => {
  const { container } = render(<Harness />);
  await screen.findByRole('button', { name: 'toggle_expand' });
  return container;
};

const pressEnter = (instance: Editor): void => {
  // `commands.keyboardShortcut` drops the selection of the handler, so the key goes to the DOM like a user key.
  act(() => {
    fireEvent.keyDown(instance.view.dom, { key: 'Enter' });
  });
};

const toggleElement = (container: HTMLElement): HTMLElement => {
  const element = container.querySelector<HTMLElement>('.note-toggle');
  if (!element) throw new Error('No toggle in the DOM.');
  return element;
};

beforeAll(() => {
  const css = readFileSync(path.resolve(import.meta.dirname, '../note-editor.css'), 'utf8');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  // jsdom has no layout, so it has no `scrollIntoView` and no `getClientRects` for a range.
  Element.prototype.scrollIntoView = vi.fn();
  // A closed toggle hides its blocks (the CSS rule), so they have no box. Same as in a browser.
  Element.prototype.getClientRects = function getClientRects(this: Element) {
    return (this.closest("[data-open='false']") ? [] : [new DOMRect()]) as unknown as DOMRectList;
  };
  document.createRange = () => {
    const range = new Range();
    range.getBoundingClientRect = () => new DOMRect();
    range.getClientRects = () => [] as unknown as DOMRectList;
    return range;
  };
});

afterEach(() => {
  cleanup();
  editor = null;
});

describe('toggle DOM and collapse CSS', () => {
  it('puts the blocks in the content element inside the toggle body', async () => {
    const container = await renderEditor();
    const content = toggleElement(container).querySelector(
      ':scope > .note-toggle-body > [data-node-view-content-react]'
    );

    // The summary is the first child of the content element, the blocks follow it.
    expect(content?.children[0]?.hasAttribute('data-toggle-summary')).toBe(true);
    expect(content?.children[1]?.tagName).toBe('UL');
    // No block is a direct child of the body: this is why a `body > block` selector matches nothing.
    expect(toggleElement(container).querySelector(':scope > .note-toggle-body > ul')).toBeNull();
  });

  it('hides the blocks after the summary while the toggle is closed, and shows them when it opens', async () => {
    const container = await renderEditor();
    const toggle = toggleElement(container);
    const list = toggle.querySelector('ul');
    const summary = toggle.querySelector('[data-toggle-summary]');
    if (!list || !summary) throw new Error('The toggle content is missing.');

    expect(toggle.getAttribute('data-open')).toBe('false');
    expect(getComputedStyle(list).display).toBe('none');
    // The summary stays visible and is bold.
    expect(getComputedStyle(summary).display).not.toBe('none');
    expect(getComputedStyle(summary).fontWeight).toBe('600');

    fireEvent.click(screen.getByRole('button', { name: 'toggle_expand' }));

    expect(toggle.getAttribute('data-open')).toBe('true');
    expect(getComputedStyle(list).display).not.toBe('none');
  });
});

describe('toggle open state', () => {
  it('opens for an outline click on a heading inside the closed toggle', async () => {
    const container = await renderEditor();
    const toggle = toggleElement(container);
    expect(toggle.getAttribute('data-open')).toBe('false');

    expect(scrollToHeading(getEditor().view.dom, 'deep', 'auto')).toBe(true);
    expect(toggle.getAttribute('data-open')).toBe('true');
  });

  it('opens when the cursor goes into the content', async () => {
    const container = await renderEditor();
    const toggle = toggleElement(container);
    const instance = getEditor();
    // The first text position of the list item: after the toggle start, the summary, the list and the item.
    const summarySize = instance.state.doc.child(0).child(0).nodeSize;
    act(() => {
      instance.view.dispatch(
        instance.state.tr.setSelection(TextSelection.near(instance.state.doc.resolve(1 + summarySize + 1)))
      );
    });

    expect(toggle.getAttribute('data-open')).toBe('true');
  });

  it('stays closed when the block after the toggle is selected (its start is the end of the toggle)', async () => {
    const container = await renderEditor();
    const toggle = toggleElement(container);
    const instance = getEditor();
    const after = instance.state.doc.child(0).nodeSize;
    act(() => {
      instance.view.dispatch(instance.state.tr.setSelection(NodeSelection.create(instance.state.doc, after)));
    });

    expect(instance.state.selection.from).toBe(after);
    expect(toggle.getAttribute('data-open')).toBe('false');
  });
});

describe('Enter in the toggle summary', () => {
  it('puts the cursor in the first text of the content, also when the content starts with a list', async () => {
    await renderEditor();
    const instance = getEditor();
    // Inside the summary text.
    act(() => {
      instance.commands.setTextSelection(3);
    });
    expect(instance.state.selection.$from.parent.type.name).toBe('toggleSummary');

    pressEnter(instance);

    const { $from } = instance.state.selection;
    expect(instance.state.selection).toBeInstanceOf(TextSelection);
    expect($from.parent.type.name).toBe('paragraph');
    expect($from.node($from.depth - 1).type.name).toBe('listItem');
    // The document is the same: Enter did not split the summary.
    expect(instance.state.doc.child(0).childCount).toBe(3);
  });

  it('does nothing special outside the summary', async () => {
    await renderEditor();
    const instance = getEditor();
    act(() => {
      instance.commands.setTextSelection(instance.state.doc.content.size - 2);
    });
    const before = instance.state.doc.childCount;

    pressEnter(instance);

    // A normal Enter splits the paragraph "After".
    expect(instance.state.doc.childCount).toBe(before + 1);
  });
});
