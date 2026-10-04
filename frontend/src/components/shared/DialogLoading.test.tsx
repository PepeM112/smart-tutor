// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DialogLoading } from './DialogLoading';

afterEach(cleanup);

describe('DialogLoading', () => {
  // Regression: `messages?.length && ...` rendered a stray "0" for an empty array.
  it('renders no stray "0" for an empty message list', () => {
    const { container } = render(<DialogLoading title="Working" messages={[]} />);
    expect(screen.getByText('Working')).toBeTruthy();
    expect(container.textContent).toBe('Working');
  });

  it('shows the first message when the list has items', () => {
    render(<DialogLoading title="Working" messages={['Step one', 'Step two']} />);
    expect(screen.getByText('Step one')).toBeTruthy();
  });
});
