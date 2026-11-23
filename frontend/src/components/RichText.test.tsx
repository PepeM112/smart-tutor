// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RichText } from './RichText';

afterEach(cleanup);

describe('RichText', () => {
  it('highlights a fenced code block', () => {
    const { container } = render(<RichText text={'```python\ndef f():\n    return 1\n```'} />);

    expect(container.querySelector('pre code.hljs')).not.toBeNull();
    expect(container.querySelector('.hljs-keyword')?.textContent).toBe('def');
  });

  it('leaves an unlabelled code block plain', () => {
    const { container } = render(<RichText text={'```\ndef f(): pass\n```'} />);

    expect(container.querySelector('pre code')).not.toBeNull();
    expect(container.querySelector('.hljs-keyword')).toBeNull();
  });

  it('renders inline math with KaTeX', () => {
    const { container } = render(<RichText text="Solve $x^2 = 4$ now" />);

    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.querySelector('.katex-display')).toBeNull();
  });

  it('renders block math in display mode', () => {
    const { container } = render(<RichText text={'$$\n\\frac{a}{b}\n$$'} />);

    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  it('shows the source of invalid LaTeX without throwing', () => {
    const { container } = render(<RichText text="Broken $\frac{1$ end" />);

    const error = container.querySelector('.katex-error');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('\\frac{1');
  });

  it('keeps an escaped dollar as text', () => {
    const { container } = render(<RichText text={'It costs \\$5 and \\$6'} />);

    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toBe('It costs $5 and $6');
  });

  it('renders plain text as one paragraph with the same text', () => {
    const { container } = render(<RichText text="What is the capital of France?" />);

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.textContent).toBe('What is the capital of France?');
    expect(container.querySelector('strong, em, code, pre, ul, ol')).toBeNull();
  });

  it('uses no paragraph element in inline mode', () => {
    const { container } = render(<RichText text="Option **A**" inline />);

    expect(container.querySelector('p')).toBeNull();
    expect(container.firstElementChild?.tagName).toBe('SPAN');
    expect(container.querySelector('strong')?.textContent).toBe('A');
  });
});
