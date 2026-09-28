// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';

import {
  addChunkHighlight,
  ChunkHighlight,
  getChunkRange,
  removeChunkHighlight,
  setChunkHighlightState,
} from './chunkHighlight';

let editor: Editor;

function createEditor(content = '<p>hello world</p>'): Editor {
  editor = new Editor({ extensions: [StarterKit, ChunkHighlight], content });
  return editor;
}

function stateOf(id: string): string | null {
  return editor.view.dom.querySelector(`[data-chunk-id="${id}"]`)?.getAttribute('data-state') ?? null;
}

afterEach(() => editor.destroy());

describe('chunkHighlight', () => {
  it('changes the state and keeps the range', () => {
    createEditor();
    expect(addChunkHighlight(editor, 'a', 1, 6)).toBe(true);
    expect(stateOf('a')).toBe('pending');

    // Regression: `DecorationSet.remove` nulls its input array, so this used to throw.
    setChunkHighlightState(editor, 'a', 'ready');
    setChunkHighlightState(editor, 'a', 'active');

    expect(stateOf('a')).toBe('active');
    expect(getChunkRange(editor, 'a')).toEqual({ from: 1, to: 6 });
  });

  it('follows the text when the user types before it', () => {
    createEditor();
    addChunkHighlight(editor, 'a', 7, 12);
    editor.commands.insertContentAt(1, 'XX');
    expect(getChunkRange(editor, 'a')).toEqual({ from: 9, to: 14 });
  });

  it('does not grow when the user types at its edges', () => {
    createEditor();
    addChunkHighlight(editor, 'a', 1, 6);
    editor.commands.insertContentAt(6, '!');
    expect(getChunkRange(editor, 'a')).toEqual({ from: 1, to: 6 });
  });

  it('is gone when its text is deleted', () => {
    createEditor();
    addChunkHighlight(editor, 'a', 1, 6);
    editor.commands.deleteRange({ from: 1, to: 6 });
    expect(getChunkRange(editor, 'a')).toBeNull();
  });

  it('refuses an overlapping or empty range', () => {
    createEditor();
    expect(addChunkHighlight(editor, 'a', 1, 6)).toBe(true);
    expect(addChunkHighlight(editor, 'b', 4, 9)).toBe(false);
    expect(addChunkHighlight(editor, 'c', 5, 5)).toBe(false);
    expect(addChunkHighlight(editor, 'd', 7, 12)).toBe(true);
  });

  it('removes only the given highlight', () => {
    createEditor();
    addChunkHighlight(editor, 'a', 1, 6);
    addChunkHighlight(editor, 'b', 7, 12);
    removeChunkHighlight(editor, 'a');
    expect(getChunkRange(editor, 'a')).toBeNull();
    expect(getChunkRange(editor, 'b')).toEqual({ from: 7, to: 12 });
  });

  it('is not in the undo history', () => {
    createEditor();
    editor.commands.insertContentAt(1, 'XX');
    addChunkHighlight(editor, 'a', 1, 6);
    editor.commands.undo();
    // The undo reverts the typing, not the highlight.
    expect(editor.getText()).toBe('hello world');
    expect(getChunkRange(editor, 'a')).not.toBeNull();
  });
});
