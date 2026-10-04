// @vitest-environment jsdom

// Open and close of the outline card with the keyboard. The main check: Esc closes the card and moves the focus
// to the trigger, and that focus must not open the card again (the trigger is inside the `nav` that opens on focus).
// The hooks that need layout are mocked: the rail gets enough space and a fixed list of headings.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoteOutline } from './NoteOutline';

import type { Editor } from '@tiptap/core';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const mocks = vi.hoisted(() => ({ scrollToHeading: vi.fn(), copyText: vi.fn() }));

vi.mock('./useHeadingOutline', () => ({
  useHeadingOutline: () => ({
    headings: [
      { id: 'one', level: 1, text: 'One', pos: 0 },
      { id: 'two', level: 2, text: 'Two', pos: 10 },
    ],
    activeId: 'one',
  }),
}));
vi.mock('./useRailPlacement', () => ({
  MIN_RAIL_SPACE: 52,
  RAIL_WIDTH: 40,
  useRailPlacement: () => ({ space: 500, layerRef: () => undefined }),
}));
vi.mock('./useScrollToHash', () => ({ useScrollToHash: () => undefined }));
vi.mock('./scroll', () => ({
  prefersReducedMotion: () => true,
  scrollToHeading: mocks.scrollToHeading,
}));
vi.mock('../copyText', () => ({ copyText: mocks.copyText }));
// The card has an exit animation. A plain element keeps the test about the keys, not about the animation.
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));

const editor = { view: { dom: document.createElement('div') } } as unknown as Editor;

const renderOutline = () => {
  render(
    <Tooltip.Provider>
      <NoteOutline editor={editor} containerRef={{ current: document.body }} noteId="note-1" />
    </Tooltip.Provider>
  );
  return screen.getByRole('button', { name: 'outline_label' });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NoteOutline keyboard', () => {
  it('opens the card when the focus comes from outside the rail', () => {
    const trigger = renderOutline();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    act(() => trigger.focus());

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'One' })).toBeTruthy();
  });

  it('closes on Esc, focuses the trigger and does not open again', () => {
    const trigger = renderOutline();
    act(() => trigger.focus());
    const item = screen.getByRole('button', { name: 'Two' });
    act(() => item.focus());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(item, { key: 'Escape' });

    // The focus moved to the trigger, from the inside of the rail: it must not open the card.
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Two' })).toBeNull();
  });

  it('closes when the focus leaves the whole rail', () => {
    const trigger = renderOutline();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => trigger.focus());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    act(() => outside.focus());

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    outside.remove();
  });

  it('scrolls to the heading on click and copies its link with the shared helper', () => {
    const trigger = renderOutline();
    act(() => trigger.focus());

    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    expect(mocks.scrollToHeading).toHaveBeenCalledWith(editor.view.dom, 'two', 'auto');

    fireEvent.click(screen.getAllByRole('button', { name: 'outline_copy_link' })[1]);
    expect(mocks.copyText).toHaveBeenCalledWith(`${window.location.origin}/notes/note-1#two`, {
      copied: 'outline_link_copied',
      failed: 'outline_link_copy_failed',
    });
  });
});
