// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { serializeMarkdown } from '../markdown';

import {
  buildLeaveMathTransaction,
  buildRemoveMathTransaction,
  buildUpdateLatexTransaction,
  insertMath,
  selectedMath,
} from './mathCommands';
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
