// @vitest-environment jsdom

// The edit mode of the link popover ends on a click outside, but not when the focus stays in the popover.
// `useLinkTarget` is mocked (it needs layout and pointer tracking): the popover gets a fixed target.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkPopover } from './LinkPopover';

import type { Editor } from '@tiptap/core';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

type MockTarget = { href: string; from: number; to: number; left: number; bottom: number };
const LINK_TARGET: MockTarget = { href: 'https://a.test', from: 1, to: 5, left: 0, bottom: 0 };
const link = vi.hoisted(() => ({
  hold: vi.fn(),
  release: vi.fn(),
  dismiss: vi.fn(),
  // A test sets it to null to act as a hold that ends without stopEdit.
  target: null as MockTarget | null,
}));
const copyText = vi.hoisted(() => vi.fn());

vi.mock('../copyText', () => ({ copyText }));

vi.mock('./useLinkTarget', () => ({
  useLinkTarget: () => ({
    target: link.target,
    hold: link.hold,
    release: link.release,
    dismiss: link.dismiss,
    pointerEnterPopover: vi.fn(),
    pointerLeavePopover: vi.fn(),
  }),
}));

// `chain()` gives a recorder: each call is kept in order, so a test can read the commands that ran.
const calls: string[] = [];
const chain = (): Record<string, unknown> => {
  const recorder: Record<string, unknown> = {};
  ['setTextSelection', 'setLink', 'unsetLink', 'run'].forEach(name => {
    recorder[name] = (arg?: unknown) => {
      calls.push(arg === undefined ? name : `${name}(${JSON.stringify(arg)})`);
      return recorder;
    };
  });
  return recorder;
};

const editor = {
  view: { dom: document.createElement('div') },
  commands: { focus: vi.fn() },
  chain,
} as unknown as Editor;

function renderPopover() {
  render(
    <Tooltip.Provider>
      <LinkPopover editor={editor} containerRef={{ current: document.body }} />
    </Tooltip.Provider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'link_edit' }));
  return screen.getByRole('textbox', { name: 'link_url_label' });
}

describe('LinkPopover edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    link.target = LINK_TARGET;
  });
  afterEach(cleanup);

  it('leaves the edit mode when the target goes away without stopEdit', () => {
    // A new element each time: React skips a rerender with the same element object.
    const popover = () => (
      <Tooltip.Provider>
        <LinkPopover editor={editor} containerRef={{ current: document.body }} />
      </Tooltip.Provider>
    );
    const { rerender } = render(popover());
    fireEvent.click(screen.getByRole('button', { name: 'link_edit' }));
    // The link text was deleted: useLinkTarget ends the hold, and the target is null.
    link.target = null;
    rerender(popover());
    link.target = LINK_TARGET;
    rerender(popover());
    expect(screen.queryByRole('textbox', { name: 'link_url_label' })).toBeNull();
    expect(screen.getByRole('button', { name: 'link_edit' })).toBeTruthy();
  });

  it('ends the edit when the input loses focus to the outside', () => {
    const input = renderPopover();
    fireEvent.blur(input, { relatedTarget: document.body });

    expect(screen.queryByRole('textbox', { name: 'link_url_label' })).toBeNull();
    expect(link.release).toHaveBeenCalled();
    // The click moved the focus on its own: the editor must not take it back.
    expect(editor.commands.focus).not.toHaveBeenCalled();
  });

  it('ends the edit when the focus goes nowhere', () => {
    const input = renderPopover();
    fireEvent.blur(input, { relatedTarget: null });

    expect(screen.queryByRole('textbox', { name: 'link_url_label' })).toBeNull();
  });

  it('keeps the edit when the focus moves to the save button', () => {
    const input = renderPopover();
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button', { name: 'link_save' }) });

    expect(screen.getByRole('textbox', { name: 'link_url_label' })).toBeTruthy();
    expect(link.release).not.toHaveBeenCalled();
  });
});

describe('LinkPopover actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    link.target = LINK_TARGET;
  });
  afterEach(cleanup);

  it('Save changes the link, puts the cursor after it, ends the edit and focuses the editor', () => {
    const input = renderPopover();
    fireEvent.change(input, { target: { value: 'https://b.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'link_save' }));

    expect(calls).toEqual([
      'setTextSelection({"from":1,"to":5})',
      'setLink({"href":"https://b.test"})',
      'setTextSelection(5)',
      'run',
    ]);
    expect(link.release).toHaveBeenCalled();
    expect(editor.commands.focus).toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'link_url_label' })).toBeNull();
  });

  it('Save with the same URL changes nothing in the document', () => {
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'link_save' }));

    expect(calls).toEqual([]);
    expect(link.release).toHaveBeenCalled();
  });

  it('Save with an empty URL removes the link', () => {
    const input = renderPopover();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(calls).toEqual(['setTextSelection({"from":1,"to":5})', 'unsetLink', 'setTextSelection(5)', 'run']);
  });

  it('Remove unsets the link on the whole range and releases the hold', () => {
    render(
      <Tooltip.Provider>
        <LinkPopover editor={editor} containerRef={{ current: document.body }} />
      </Tooltip.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'link_remove' }));

    expect(calls).toEqual(['setTextSelection({"from":1,"to":5})', 'unsetLink', 'setTextSelection(5)', 'run']);
    expect(link.release).toHaveBeenCalled();
    expect(editor.commands.focus).toHaveBeenCalled();
  });

  it('Esc in the input ends the edit without a change and focuses the editor', () => {
    const input = renderPopover();
    fireEvent.change(input, { target: { value: 'https://b.test' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(calls).toEqual([]);
    expect(link.release).toHaveBeenCalled();
    expect(editor.commands.focus).toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'link_url_label' })).toBeNull();
  });

  it('Esc in the editor dismisses the popover', () => {
    render(
      <Tooltip.Provider>
        <LinkPopover editor={editor} containerRef={{ current: document.body }} />
      </Tooltip.Provider>
    );
    fireEvent.keyDown(editor.view.dom, { key: 'Escape' });

    expect(link.dismiss).toHaveBeenCalled();
  });

  it('Copy uses the shared copy helper with the link messages', () => {
    render(
      <Tooltip.Provider>
        <LinkPopover editor={editor} containerRef={{ current: document.body }} />
      </Tooltip.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'link_copy' }));

    expect(copyText).toHaveBeenCalledWith('https://a.test', { copied: 'link_copied', failed: 'link_copy_failed' });
  });
});
