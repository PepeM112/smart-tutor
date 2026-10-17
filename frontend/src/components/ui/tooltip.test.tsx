// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tooltip } from './tooltip';

afterEach(cleanup);

describe('Tooltip', () => {
  it('gives a wrapped control no popup attributes on the wrapper span', () => {
    render(
      <Tooltip content="Hint" wrapsControl>
        <button type="button">Go</button>
      </Tooltip>
    );

    const wrapper = screen.getByRole('button', { name: 'Go' }).parentElement;
    expect(wrapper?.getAttribute('data-slot')).toBe('tooltip-trigger');
    expect(wrapper?.hasAttribute('aria-haspopup')).toBe(false);
    expect(wrapper?.hasAttribute('aria-expanded')).toBe(false);
    expect(wrapper?.hasAttribute('aria-controls')).toBe(false);
  });

  it('keeps the popup attributes on the default trigger', () => {
    render(<Tooltip content="Hint" />);

    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
