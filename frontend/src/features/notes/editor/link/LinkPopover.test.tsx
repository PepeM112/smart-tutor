// @vitest-environment jsdom

// The edit mode of the link popover ends on a click outside, but not when the focus stays in the popover.
// `useLinkTarget` is mocked (it needs layout and pointer tracking): the popover gets a fixed target.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkPopover } from './LinkPopover';

import type { Editor } from '@tiptap/core';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const link = vi.hoisted(() => ({ hold: vi.fn(), release: vi.fn() }));

vi.mock('./useLinkTarget', () => ({
  useLinkTarget: () => ({
    target: { href: 'https://a.test', from: 1, to: 5, left: 0, bottom: 0 },
    hold: link.hold,
    release: link.release,
    dismiss: vi.fn(),
    pointerEnterPopover: vi.fn(),
    pointerLeavePopover: vi.fn(),
  }),
}));

const editor = {
  view: { dom: document.createElement('div') },
  commands: { focus: vi.fn() },
  chain: vi.fn(),
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
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

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
