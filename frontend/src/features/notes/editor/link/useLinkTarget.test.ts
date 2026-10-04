// @vitest-environment jsdom

// The link range that the popover holds while the URL is edited must follow the document. Two levels:
// - `mapHeld`: the pure mapping rule,
// - the hook with a real editor: hover a link, hold it, change the document, read the target again.
// jsdom has no layout: every rect is zero, and the timers (hover delay, animation frame) are faked.

import { act, renderHook } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { Mapping, StepMap } from '@tiptap/pm/transform';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteLink } from './noteLink';
import { mapHeld, useLinkTarget, type LinkTarget } from './useLinkTarget';

const held: LinkTarget = { href: 'https://a.test', from: 5, to: 9, left: 0, bottom: 0 };

/** A mapping of one step: `insert` characters at `pos` (or a delete of `size` characters). */
const insertAt = (pos: number, size: number): Mapping => new Mapping([new StepMap([pos, 0, size])]);
const deleteRange = (pos: number, size: number): Mapping => new Mapping([new StepMap([pos, size, 0])]);

describe('mapHeld', () => {
  it('moves the range when text is inserted before it', () => {
    expect(mapHeld(held, insertAt(1, 3))).toMatchObject({ from: 8, to: 12 });
  });

  it('keeps the range when text is inserted after it', () => {
    expect(mapHeld(held, insertAt(20, 3))).toMatchObject({ from: 5, to: 9 });
  });

  it('does not take text typed at an edge of the range', () => {
    expect(mapHeld(held, insertAt(5, 2))).toMatchObject({ from: 7, to: 11 });
    expect(mapHeld(held, insertAt(9, 2))).toMatchObject({ from: 5, to: 9 });
  });

  it('shrinks the range when part of it is deleted', () => {
    expect(mapHeld(held, deleteRange(7, 4))).toMatchObject({ from: 5, to: 7 });
  });

  it('gives null when the whole range is deleted', () => {
    expect(mapHeld(held, deleteRange(4, 7))).toBeNull();
  });
});

describe('useLinkTarget held range', () => {
  let editor: Editor;
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    editor = new Editor({
      element: container,
      extensions: [StarterKit.configure({ link: false }), NoteLink.configure({ openOnClick: false, autolink: false })],
      content: '<p>Go <a href="https://a.test">link</a> now</p>',
    });
    // The window height check of ResizeObserver is not needed: jsdom has no `ResizeObserver`.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
  });

  afterEach(() => {
    editor.destroy();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Hover the link, wait for the open delay and the frame, and hold the target. */
  function holdHoveredLink() {
    const view = renderHook(() => useLinkTarget(editor, { current: container }));
    const anchor = container.querySelector('a');
    if (!anchor) throw new Error('No link in the DOM.');
    act(() => {
      anchor.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(300);
    });
    expect(view.result.current.target).toMatchObject({ from: 4, to: 8, href: 'https://a.test' });
    act(() => view.result.current.hold());
    return view;
  }

  it('maps the held range when text is inserted before the link', () => {
    const { result } = holdHoveredLink();

    act(() => {
      editor.commands.insertContentAt(1, 'xx');
      vi.advanceTimersByTime(50);
    });

    expect(result.current.target).toMatchObject({ from: 6, to: 10 });
  });

  it('releases the hold when the held text is deleted', () => {
    const { result } = holdHoveredLink();

    act(() => {
      editor.commands.deleteRange({ from: 3, to: 9 });
      vi.advanceTimersByTime(50);
    });

    expect(result.current.target).toBeNull();
  });
});
