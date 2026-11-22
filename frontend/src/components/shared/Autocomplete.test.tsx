// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Autocomplete } from './Autocomplete';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

const EXISTING = ['algebra', 'geometry', 'calculus'];

type HarnessProps = {
  initial?: string[];
  fetchOptions?: (search: string) => Promise<string[]>;
  maxItems?: number;
  allowCreate?: boolean;
  onChange?: (value: string[]) => void;
};

function Harness({ initial = [], fetchOptions, maxItems, allowCreate = true, onChange }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <Autocomplete
      value={value}
      onChange={next => {
        setValue(next);
        onChange?.(next);
      }}
      queryKey={['test-tags']}
      fetchOptions={fetchOptions ?? (() => Promise.resolve(EXISTING))}
      normalize={raw => raw.trim().toLowerCase()}
      allowCreate={allowCreate}
      maxItems={maxItems}
      aria-label="Tags"
    />
  );
}

function renderField(props: HarnessProps = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>
  );
  return screen.getByRole('combobox');
}

function type(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
}

afterEach(cleanup);

describe('Autocomplete', () => {
  it('fetches the first list on focus and shows the options', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(EXISTING);
    const input = renderField({ fetchOptions });

    fireEvent.focus(input);

    expect(await screen.findByRole('option', { name: 'algebra' })).toBeTruthy();
    expect(fetchOptions).toHaveBeenCalledWith('');
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('waits for the debounce and fetches only the last term', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(EXISTING);
    const input = renderField({ fetchOptions });
    fireEvent.focus(input);
    await screen.findByRole('option', { name: 'algebra' });
    fetchOptions.mockClear();

    type(input, 'g');
    type(input, 'ge');
    expect(fetchOptions).not.toHaveBeenCalled();

    await waitFor(() => expect(fetchOptions).toHaveBeenCalledWith('ge'));
    expect(fetchOptions).toHaveBeenCalledTimes(1);
  });

  it('adds an option on click and removes it from the list', async () => {
    const onChange = vi.fn();
    const input = renderField({ onChange });
    fireEvent.focus(input);

    fireEvent.click(await screen.findByRole('option', { name: 'geometry' }));

    expect(onChange).toHaveBeenCalledWith(['geometry']);
    expect(screen.queryByRole('option', { name: 'geometry' })).toBeNull();
  });

  it('selects the active option with the arrow keys and Enter', async () => {
    const onChange = vi.fn();
    const input = renderField({ onChange });
    fireEvent.focus(input);
    await screen.findByRole('option', { name: 'algebra' });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'geometry' }).id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['algebra']);
  });

  it('creates a new normalized value from free text on Enter', async () => {
    const onChange = vi.fn();
    const input = renderField({ onChange });
    fireEvent.focus(input);
    await screen.findByRole('option', { name: 'algebra' });

    type(input, '  Topology ');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['topology']);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('creates values on a comma, also for a pasted list', () => {
    const onChange = vi.fn();
    const input = renderField({ onChange });

    type(input, 'one,two,thr');

    expect(onChange).toHaveBeenLastCalledWith(['one', 'two']);
    expect((input as HTMLInputElement).value).toBe('thr');
  });

  it('does not add a duplicate', () => {
    const onChange = vi.fn();
    const input = renderField({ initial: ['algebra'], onChange });

    type(input, 'Algebra');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last chip with Backspace on an empty input only', () => {
    const onChange = vi.fn();
    const input = renderField({ initial: ['a', 'b'], onChange });

    type(input, 'x');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();

    type(input, '');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('ignores Enter while an IME composition is open', () => {
    const onChange = vi.fn();
    const input = renderField({ onChange });

    type(input, 'トポ');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['トポ']);
  });

  it('does not add the first option on Enter when the list is closed and create is off', async () => {
    const onChange = vi.fn();
    const input = renderField({ allowCreate: false, onChange });
    fireEvent.focus(input);
    await screen.findByRole('option', { name: 'algebra' });

    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(input);
    await screen.findByRole('option', { name: 'algebra' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['algebra']);
  });

  it('closes the list on Escape', async () => {
    const input = renderField();
    fireEvent.focus(input);
    await screen.findByRole('option', { name: 'algebra' });

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('stops at the max number of values', () => {
    const onChange = vi.fn();
    const input = renderField({ initial: ['a', 'b'], maxItems: 2, onChange });

    fireEvent.focus(input);
    type(input, 'c');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clears all chips', () => {
    const onChange = vi.fn();
    renderField({ initial: ['a', 'b'], onChange });

    fireEvent.click(screen.getByRole('button', { name: 'common.clear_all' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
