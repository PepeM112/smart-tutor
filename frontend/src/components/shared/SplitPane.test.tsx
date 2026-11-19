// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SplitPane } from './SplitPane';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `common.${key}` }));

const KEY = 'split-pane-test';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    }
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPane = (side: React.ReactNode = <p>side</p>) =>
  render(<SplitPane storageKey={KEY} main={<p>main</p>} side={side} dividerLabel="Resize panels" />);

describe('SplitPane', () => {
  it('shows both panes and a divider with the default accessible name', () => {
    render(<SplitPane storageKey={KEY} main={<p>main</p>} side={<p>side</p>} />);

    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText('side')).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'common.resize_panel' })).toBeTruthy();
  });

  it('has a focusable vertical divider with the given name', () => {
    renderPane();
    const divider = screen.getByRole('separator', { name: 'Resize panels' });

    expect(divider.getAttribute('tabindex')).toBe('0');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('has no divider in the accessibility tree without a side pane', () => {
    renderPane(null);

    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.queryByText('side')).toBeNull();
  });

  it('keeps the side content while the pane folds, then removes it', async () => {
    const { rerender } = renderPane();

    rerender(<SplitPane storageKey={KEY} main={<p>main</p>} side={null} />);
    expect(screen.queryByText('side')).not.toBeNull();

    await vi.waitFor(() => expect(screen.queryByText('side')).toBeNull());
  });

  it('resets the saved ratio on double click', () => {
    localStorage.setItem(KEY, '0.7');
    render(<SplitPane storageKey={KEY} defaultRatio={0.4} main={<p>main</p>} side={<p>side</p>} />);

    fireEvent.doubleClick(screen.getByRole('separator'));

    expect(localStorage.getItem(KEY)).toBe('0.4');
  });
});
