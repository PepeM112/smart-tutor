// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { shouldToggleOnRowClick } from './optionRowClick';

import type { MouseEvent } from 'react';

afterEach(() => {
  document.body.innerHTML = '';
});

function clickOn(html: string, selector: string): MouseEvent<HTMLElement> {
  document.body.innerHTML = html;
  const target = document.body.querySelector(selector);
  if (!target) throw new Error(`No element for ${selector}`);
  return { target } as unknown as MouseEvent<HTMLElement>;
}

describe('shouldToggleOnRowClick', () => {
  it('toggles on a click on the option text', () => {
    expect(shouldToggleOnRowClick(clickOn('<div><p>text</p></div>', 'p'))).toBe(true);
  });

  it.each([
    ['a link', '<div><a href="#">go</a></div>', 'a'],
    ['a code block', '<div><pre><code>x</code></pre></div>', 'code'],
    ['the checkbox button', '<div><button>c</button></div>', 'button'],
  ])('does not toggle on %s', (_name, html, selector) => {
    expect(shouldToggleOnRowClick(clickOn(html, selector))).toBe(false);
  });
});
