// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ButtonGroup } from './button-group';

const ITEMS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B', disabled: true },
  { value: 'c', label: 'C' },
];

afterEach(cleanup);

describe('ButtonGroup', () => {
  it('is a radio group with one checked radio and one tab stop', () => {
    render(<ButtonGroup aria-label="Letters" value="c" onChange={() => undefined} items={ITEMS} />);

    expect(screen.getByRole('radiogroup', { name: 'Letters' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map(radio => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    expect(screen.getAllByRole('radio').map(radio => radio.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('makes the first enabled radio the tab stop when no value matches', () => {
    render(<ButtonGroup value="x" onChange={() => undefined} items={ITEMS} />);

    expect(screen.getAllByRole('radio').map(radio => radio.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves with the arrow keys, skips disabled items and wraps around', () => {
    const onChange = vi.fn();
    render(<ButtonGroup value="a" onChange={onChange} items={ITEMS} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'C' }));

    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('c');
  });
});
