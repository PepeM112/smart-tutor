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

  it('renders no block element in inline mode for a list or a code fence', () => {
    const text = '- one\n- two\n\n```python\nprint(1)\n```\n\n> quote\n\n# Title';
    const { container } = render(<RichText text={text} inline />);

    expect(container.querySelector('p, pre, ul, ol, li, blockquote, h1, table')).toBeNull();
    expect(container.textContent).toContain('one');
    expect(container.textContent).toContain('print(1)');
  });

  it('opens links in a new tab without a referrer or opener', () => {
    const { container } = render(
      <>
        <RichText text="See [docs](https://x.dev)" />
        <RichText text="See [docs](https://x.dev)" inline />
      </>
    );

    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(2);
    links.forEach(link => {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });

  it('parses single-dollar math by default but only double-dollar math in chat', () => {
    const price = 'It costs $5 to $10 today';
    const { container, rerender } = render(<RichText text={price} />);
    expect(container.querySelector('.katex')).not.toBeNull();

    rerender(<RichText text={price} variant="chat" />);
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toBe(price);

    rerender(<RichText text="Solve $$x^2$$ now" variant="chat" />);
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('renders an inline fraction in display size, and keeps \\tfrac small', () => {
    const katexHtml = (text: string): string => {
      const { container } = render(<RichText text={text} />);
      const html = container.querySelector('.katex-html')?.innerHTML ?? '';
      cleanup();
      return html;
    };

    expect(katexHtml('$\\frac{a}{b}$')).toBe(katexHtml('$\\dfrac{a}{b}$'));
    expect(katexHtml('$\\tfrac{a}{b}$')).not.toBe(katexHtml('$\\dfrac{a}{b}$'));
  });

  it('caps the size of a user-supplied dimension', () => {
    const { container } = render(<RichText text="$\\rule{1e5em}{1e5em}$" />);
    const rule = container.querySelector<HTMLElement>('.katex-html span[style*="border-right-width"]');

    expect(Number.parseFloat(rule?.style.borderRightWidth ?? '0')).toBeLessThanOrEqual(20);
  });
});
