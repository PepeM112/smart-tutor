// @vitest-environment jsdom

// Keys of the slash menu popup. The main check: when the filter finds no item, the popup gives the keys back to
// the editor (Enter must not be lost, and the arrow keys must not make the index `NaN`).

import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlashMenuPopup, type SlashMenuPopupHandle } from './SlashMenu';

import type { SuggestionKeyDownProps } from '@tiptap/suggestion';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

type PopupProps = ComponentProps<typeof SlashMenuPopup>;
type Item = PopupProps['items'][number];

const execute = vi.fn();
const makeItem = (labelKey: string, label: string): Item => ({ labelKey, label, icon: '', execute });
const ITEMS = [makeItem('slash_text', 'Text'), makeItem('slash_h1', 'Heading 1'), makeItem('slash_quote', 'Quote')];

const command = vi.fn();

function renderPopup(query: string) {
  const ref = createRef<SlashMenuPopupHandle>();
  const props = { query, items: ITEMS, command, ref } as unknown as PopupProps;
  render(<SlashMenuPopup {...props} />);
  return ref;
}

/** Send a key to the popup like the suggestion plugin does. Gives what the popup returns. */
const press = (ref: ReturnType<typeof renderPopup>, key: string): boolean => {
  let handled = false;
  act(() => {
    handled =
      ref.current?.onKeyDown({ event: new KeyboardEvent('keydown', { key }) } as SuggestionKeyDownProps) ?? false;
  });
  return handled;
};

const selectedLabel = (): string | undefined =>
  screen.getAllByRole('button').find(button => button.className.includes('bg-muted '))?.textContent ?? undefined;

beforeEach(() => {
  // jsdom has no layout, so it has no `scrollIntoView`.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SlashMenuPopup keys', () => {
  it('moves the choice with the arrow keys and wraps around', () => {
    const ref = renderPopup('');
    expect(selectedLabel()).toBe('slash_text');

    expect(press(ref, 'ArrowDown')).toBe(true);
    expect(selectedLabel()).toBe('slash_h1');

    press(ref, 'ArrowUp');
    press(ref, 'ArrowUp');
    expect(selectedLabel()).toBe('slash_quote');
  });

  it('runs the chosen item on Enter', () => {
    const ref = renderPopup('');
    press(ref, 'ArrowDown');

    expect(press(ref, 'Enter')).toBe(true);
    expect(command).toHaveBeenCalledWith(ITEMS[1]);
  });

  it('gives the keys back to the editor when the filter finds no item', () => {
    const ref = renderPopup('zzz');

    expect(screen.queryByRole('button')).toBeNull();
    expect(press(ref, 'Enter')).toBe(false);
    expect(press(ref, 'ArrowDown')).toBe(false);
    expect(press(ref, 'ArrowUp')).toBe(false);
    expect(command).not.toHaveBeenCalled();
  });

  it('filters by the English label and by the translated label', () => {
    renderPopup('head');

    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['slash_h1']);
  });
});
