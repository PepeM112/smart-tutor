// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type FilterItem, FilterType } from '@/lib/filters';

import { FilterField } from './FilterField';

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));

const ITEM: FilterItem = {
  label: 'Type',
  key: 'type',
  type: FilterType.MULTIPLE_SELECT,
  options: { items: [{ label: 'Tests', value: 'tests' }] },
};

afterEach(cleanup);

function renderField() {
  render(<FilterField item={ITEM} value={undefined} onChange={vi.fn()} />);
  return screen.getByRole('textbox');
}

describe('multi select filter field', () => {
  it('does not open the list when it gets focus', () => {
    const input = renderField();

    input.focus();

    expect(screen.queryByText('Tests')).toBeNull();
  });

  it('opens the list on click', () => {
    const input = renderField();

    fireEvent.click(input);

    expect(screen.getByText('Tests')).toBeTruthy();
  });

  it('opens the list on typing and on ArrowDown', () => {
    const input = renderField();

    fireEvent.change(input, { target: { value: 'te' } });
    expect(screen.getByText('Tests')).toBeTruthy();

    cleanup();
    fireEvent.keyDown(renderField(), { key: 'ArrowDown' });
    expect(screen.getByText('Tests')).toBeTruthy();
  });
});
