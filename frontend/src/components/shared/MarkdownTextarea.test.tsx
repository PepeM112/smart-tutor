// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownTextarea } from './MarkdownTextarea';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

afterEach(cleanup);

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MarkdownTextarea value={value} onChange={e => setValue(e.target.value)} placeholder="Prompt" />;
}

describe('MarkdownTextarea', () => {
  it('round-trips typed text through onChange', () => {
    render(<Harness />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Solve $x^2$' } });

    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('Solve $x^2$');
  });

  it('shows the rendered text in preview and keeps the value when switching back', () => {
    const { container } = render(<Harness initial={'```python\nprint(1)\n```'} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.preview' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(container.querySelector('pre code')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'common.preview' }));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('```python\nprint(1)\n```');
  });

  it('marks the toggle as pressed only in preview', () => {
    render(<Harness initial="a" />);
    const toggle = screen.getByRole('button', { name: 'common.preview' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'common.preview' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the textarea mounted but hidden in preview', () => {
    const { container } = render(<Harness initial="a" />);

    fireEvent.click(screen.getByRole('button', { name: 'common.preview' }));

    expect(container.querySelector('textarea')?.hidden).toBe(true);
  });

  it('shows the placeholder in preview when the value is empty', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'common.preview' }));

    expect(screen.getByText('Prompt')).toBeTruthy();
  });
});
