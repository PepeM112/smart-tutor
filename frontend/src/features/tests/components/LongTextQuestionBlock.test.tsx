// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LongTextLength, QuestionType } from '@/client';

import { LongTextQuestionBlock, type LongTextQuestionData } from './LongTextQuestionBlock';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const INITIAL: LongTextQuestionData = {
  key: 'q1',
  type: QuestionType.LONG_TEXT,
  prompt: 'Explain it',
  lengthLimit: LongTextLength.SHORT,
  points: 1,
  criteria: [
    { point: 'a', weight: 0.5, category: 'Grammar' },
    { point: 'b', weight: 0.3, category: 'Logic' },
    { point: 'c', weight: 0.2, category: '' },
  ],
};

function Harness() {
  const [data, setData] = useState(INITIAL);
  return <LongTextQuestionBlock data={data} onChange={setData} onRemove={() => undefined} />;
}

afterEach(cleanup);

// The empty-category input is the third combobox.
function openCategoryList(): HTMLInputElement {
  const input = screen.getAllByRole('combobox')[2] as HTMLInputElement;
  fireEvent.focus(input);
  return input;
}

describe('LongTextQuestionBlock category autocomplete', () => {
  it('exposes combobox and listbox roles with aria-expanded', () => {
    render(<Harness />);
    const input = screen.getAllByRole('combobox')[2];
    expect(input.getAttribute('aria-expanded')).toBe('false');

    fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox').id).toBe(input.getAttribute('aria-controls'));
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Grammar', 'Logic']);
  });

  it('moves the highlight with ArrowDown / ArrowUp and wraps around', () => {
    render(<Harness />);
    const input = openCategoryList();
    const [first, second] = screen.getAllByRole('option');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(second.id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(second.id);
  });

  it('picks the highlighted option with Enter', () => {
    render(<Harness />);
    const input = openCategoryList();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input.value).toBe('Logic');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes the list with Escape and reopens it with ArrowDown', () => {
    render(<Harness />);
    const input = openCategoryList();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('picks an option with the mouse', () => {
    render(<Harness />);
    const input = openCategoryList();

    act(() => {
      fireEvent.mouseDown(screen.getByRole('option', { name: 'Grammar' }));
    });
    expect(input.value).toBe('Grammar');
  });

  it('opens the list again when the user types after Escape', () => {
    render(<Harness />);
    const input = openCategoryList();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.change(input, { target: { value: 'L' } });
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Logic']);
  });

  it('resets the highlight when the suggestions change, so Enter never picks a missing item', () => {
    render(<Harness />);
    const input = openCategoryList();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);

    // Another criterion takes the category 'Logic': the list of this input shrinks to one item.
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Logic' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });
});
