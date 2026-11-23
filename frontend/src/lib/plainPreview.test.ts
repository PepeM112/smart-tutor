import { describe, expect, it } from 'vitest';

import { toPlainPreview } from './plainPreview';

describe('toPlainPreview', () => {
  it('returns plain text unchanged', () => {
    expect(toPlainPreview('What is the capital of France?')).toBe('What is the capital of France?');
  });

  it('strips emphasis, headings, lists and quotes', () => {
    expect(toPlainPreview('# Title\n**bold** and *it* and ~~gone~~\n- item\n> quote')).toBe(
      'Title bold and it and gone item quote'
    );
  });

  it('keeps the text of links and images', () => {
    expect(toPlainPreview('See [the docs](https://x.dev) ![logo](a.png)')).toBe('See the docs logo');
  });

  it('removes inline code backticks and keeps the code', () => {
    expect(toPlainPreview('Call `snake_case_name` first')).toBe('Call snake_case_name first');
  });

  it('replaces a fenced block with its language', () => {
    expect(toPlainPreview('What prints?\n```python\nprint(1)\n```\nChoose one.')).toBe(
      'What prints? [python] Choose one.'
    );
  });

  it('uses [code] for an unlabelled or unclosed fence', () => {
    expect(toPlainPreview('A\n```\nx\n```')).toBe('A [code]');
    expect(toPlainPreview('A\n```sql\nSELECT 1')).toBe('A [sql]');
  });

  it('keeps math source with the dollar signs', () => {
    expect(toPlainPreview('Solve $x_1 * x_2 = 4$ and $$\\frac{a}{b}$$')).toBe(
      'Solve $x_1 * x_2 = 4$ and $$\\frac{a}{b}$$'
    );
  });

  it('turns an escaped dollar into a dollar', () => {
    expect(toPlainPreview('It costs \\$5')).toBe('It costs $5');
  });

  it('keeps a math span that contains an escaped dollar in one piece', () => {
    expect(toPlainPreview('Cost $a \\$ b$ and \\$5')).toBe('Cost $a \\$ b$ and $5');
    expect(toPlainPreview('$$x \\$ y$$')).toBe('$$x \\$ y$$');
  });

  it('collapses whitespace', () => {
    expect(toPlainPreview('  a \n\n  b\t c  ')).toBe('a b c');
  });
});
