// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { serializeMarkdown } from '../markdown';

import {
  buildLeaveMathTransaction,
  buildRemoveMathTransaction,
  buildUpdateLatexTransaction,
  insertMath,
  selectedMath,
} from './mathCommands';
import { mathPlugin } from './mathPlugin';
import { createNoteMathExtensions, NoteMarkdown } from './noteMath';

let editor: Editor;

beforeEach(() => {
  editor = new Editor({ extensions: [StarterKit, NoteMarkdown, ...createNoteMathExtensions()], content: '' });
});

afterEach(() => editor.destroy());

/** The "/" of the slash menu sits at the end of the text, as in the real flow. */
function typeSlash(text: string): { from: number; to: number } {
  editor.commands.setContent(`<p>${text}</p>`);
  const to = editor.state.doc.content.size - 1;
  return { from: to - 1, to };
}

describe('insertMath', () => {
  it('inserts an empty inline formula and selects it', () => {
    insertMath(editor, typeSlash('a /'), 'inlineMath');
    expect(selectedMath(editor.state)).toMatchObject({ kind: 'inlineMath', latex: '' });
  });

  it('a block replaces the empty line of the "/" and keeps a paragraph after it', () => {
    insertMath(editor, typeSlash('/'), 'blockMath');
    expect(selectedMath(editor.state)).toMatchObject({ kind: 'blockMath', pos: 0 });
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
  });
});

describe('insertMath block on a line with text', () => {
  const blockPositions = (): string[] => editor.state.doc.children.map(child => child.type.name);

  it('goes after the paragraph and keeps its text', () => {
    insertMath(editor, typeSlash('some text /'), 'blockMath');
    expect(blockPositions().slice(0, 2)).toEqual(['paragraph', 'blockMath']);
    expect(editor.state.doc.firstChild?.textContent).toBe('some text ');
    expect(selectedMath(editor.state)).toMatchObject({ kind: 'blockMath' });
  });

  it('goes after an empty paragraph inside a list item', () => {
    editor.commands.setContent('<ul><li><p>/</p></li></ul>');
    const to = editor.state.doc.resolve(3).end();
    expect(() => insertMath(editor, { from: to - 1, to }, 'blockMath')).not.toThrow();
    const item = editor.state.doc.firstChild?.firstChild;
    expect(item?.children.map(child => child.type.name)).toEqual(['paragraph', 'blockMath']);
    expect(selectedMath(editor.state)).toMatchObject({ kind: 'blockMath' });
  });
});

describe('math popover transactions', () => {
  it('updating the latex keeps the node selected and saves it as markdown', () => {
    insertMath(editor, typeSlash('a /'), 'inlineMath');
    const target = selectedMath(editor.state);
    const tr = buildUpdateLatexTransaction(editor.state, target?.pos ?? -1, 'x^2');
    if (tr) editor.view.dispatch(tr);

    expect(selectedMath(editor.state)?.latex).toBe('x^2');
    expect(serializeMarkdown(editor)).toBe('a $x^2$');
  });

  it('leaving a block at the end of the document puts the cursor in a paragraph', () => {
    insertMath(editor, typeSlash('/'), 'blockMath');
    const tr = buildLeaveMathTransaction(editor.state, 0);
    if (tr) editor.view.dispatch(tr);

    expect(selectedMath(editor.state)).toBeNull();
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('removing deletes the node', () => {
    insertMath(editor, typeSlash('a /'), 'inlineMath');
    const tr = buildRemoveMathTransaction(editor.state, selectedMath(editor.state)?.pos ?? -1);
    if (tr) editor.view.dispatch(tr);

    expect(selectedMath(editor.state)).toBeNull();
    expect(serializeMarkdown(editor)).toBe('a ');
  });
});

describe('math input rules', () => {
  const typeText = (text: string): void => {
    editor.commands.setContent('<p></p>');
    editor.commands.focus('end');
    Array.from(text).forEach(char => {
      const { from, to } = editor.state.selection;
      const handled = editor.view.someProp('handleTextInput', handler =>
        handler(editor.view, from, to, char, () => editor.state.tr)
      );
      if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
    });
  };

  it('$x^2$ becomes inline math', () => {
    typeText('a $x^2$');
    expect(serializeMarkdown(editor)).toBe('a $x^2$');
    expect(editor.getJSON().content?.[0].content?.some(node => node.type === 'inlineMath')).toBe(true);
  });

  it('currency does not become math', () => {
    typeText('pay $5 or $');
    expect(editor.getJSON().content?.[0].content?.some(node => node.type === 'inlineMath')).toBe(false);
  });

  it('$$x$$ in an empty line becomes a math block', () => {
    typeText('$$x$$');
    expect(editor.getJSON().content?.[0].type).toBe('blockMath');
  });
});

describe('math rendering', () => {
  it('invalid latex shows its source and does not throw', () => {
    const readOnly = new Editor({
      extensions: [StarterKit, NoteMarkdown, ...createNoteMathExtensions()],
      editable: false,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: '\\frac{1' } }] }],
      },
    });
    expect(readOnly.view.dom.querySelector('.inline-math-error')?.textContent).toBe('\\frac{1');
    readOnly.destroy();
  });

  it('valid latex renders KaTeX', () => {
    const readOnly = new Editor({
      extensions: [StarterKit, NoteMarkdown, ...createNoteMathExtensions()],
      editable: false,
      content: { type: 'doc', content: [{ type: 'blockMath', attrs: { latex: 'x^2' } }] },
    });
    expect(readOnly.view.dom.querySelector('.katex')).not.toBeNull();
    readOnly.destroy();
  });
});

describe('Enter on a selected math node', () => {
  it('leaves the document unchanged and asks the popover for the focus', () => {
    insertMath(editor, typeSlash('a /'), 'inlineMath');
    editor.view.dispatch(
      buildUpdateLatexTransaction(editor.state, selectedMath(editor.state)?.pos ?? -1, 'x') ?? editor.state.tr
    );
    const before: unknown = editor.state.doc.toJSON();
    const metas: unknown[] = [];
    editor.on('transaction', ({ transaction }) => metas.push(transaction.getMeta('mathFocus')));

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    const isHandled = editor.view.someProp('handleKeyDown', handler => handler(editor.view, event));

    expect(isHandled).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(selectedMath(editor.state)?.latex).toBe('x');
    expect(metas).toContain(true);
  });

  it('is ignored during IME composition', () => {
    insertMath(editor, typeSlash('a /'), 'inlineMath');
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true });
    const plugin = mathPlugin();
    expect(plugin.props.handleKeyDown?.call(plugin, editor.view, event)).toBe(false);
  });
});

describe('empty math node', () => {
  it('is deleted when the selection leaves it', () => {
    insertMath(editor, typeSlash('a /'), 'inlineMath');
    expect(selectedMath(editor.state)).not.toBeNull();

    editor.commands.setTextSelection(1);

    expect(editor.getJSON().content?.[0].content?.some(node => node.type === 'inlineMath')).toBe(false);
  });

  it('stays while it is selected, and a node with latex stays after the selection leaves', () => {
    insertMath(editor, typeSlash('a /'), 'inlineMath');
    editor.view.dispatch(
      buildUpdateLatexTransaction(editor.state, selectedMath(editor.state)?.pos ?? -1, 'x') ?? editor.state.tr
    );
    editor.commands.setTextSelection(1);

    expect(serializeMarkdown(editor)).toBe('a $x$');
  });
});

describe('KaTeX fractions', () => {
  const renderInline = (latex: string): string => {
    const readOnly = new Editor({
      extensions: [StarterKit, NoteMarkdown, ...createNoteMathExtensions()],
      editable: false,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex } }] }] },
    });
    const html = readOnly.view.dom.querySelector('.katex-html')?.outerHTML ?? '';
    readOnly.destroy();
    return html;
  };

  it('\\frac renders as \\dfrac, and \\tfrac keeps the small form', () => {
    const fraction = renderInline('\\frac{1}{2}');
    expect(fraction).toBe(renderInline('\\dfrac{1}{2}'));
    expect(fraction).not.toBe(renderInline('\\tfrac{1}{2}'));
  });
});

describe('NoteMarkdown', () => {
  it('escapes "$" in text', () => {
    editor.commands.setContent('<p>Pay $5 now</p>');
    expect(serializeMarkdown(editor)).toBe('Pay \\$5 now');
  });

  it('warns once when the private escape method is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original: unknown = Reflect.get(MarkdownManager.prototype, 'escapeMarkdownSyntax');
    Reflect.set(MarkdownManager.prototype, 'escapeMarkdownSyntax', undefined);
    try {
      new Editor({ extensions: [StarterKit, NoteMarkdown] }).destroy();
      new Editor({ extensions: [StarterKit, NoteMarkdown] }).destroy();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.set(MarkdownManager.prototype, 'escapeMarkdownSyntax', original);
      warn.mockRestore();
    }
  });
});
