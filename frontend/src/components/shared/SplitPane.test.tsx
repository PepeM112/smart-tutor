// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SplitPane } from './SplitPane';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `common.${key}` }));

const KEY = 'split-pane-test';

beforeEach(() => {
  localStorage.clear();
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

describe('SplitPane divider', () => {
  it('has a default accessible name when no label is given', () => {
    render(<SplitPane storageKey={KEY} main={<p>main</p>} side={<p>side</p>} />);
    expect(screen.getByRole('separator', { name: 'common.resize_panel' })).toBeTruthy();
  });

  it('is a focusable vertical separator with the split as its value', () => {
    renderPane();
    const divider = screen.getByRole('separator', { name: 'Resize panels' });

    expect(divider.getAttribute('tabindex')).toBe('0');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.getAttribute('aria-valuenow')).toBe('50');
    expect(divider.getAttribute('aria-valuemin')).toBe('20');
    expect(divider.getAttribute('aria-valuemax')).toBe('80');
  });

  it('moves with the arrow keys, Home and End, and saves the ratio', () => {
    renderPane();
    const divider = screen.getByRole('separator');

    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(divider.getAttribute('aria-valuenow')).toBe('52');
    expect(localStorage.getItem(KEY)).toBe('0.52');

    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    expect(divider.getAttribute('aria-valuenow')).toBe('48');

    fireEvent.keyDown(divider, { key: 'End' });
    expect(divider.getAttribute('aria-valuenow')).toBe('80');
    fireEvent.keyDown(divider, { key: 'Home' });
    expect(divider.getAttribute('aria-valuenow')).toBe('20');
  });

  it('resets the split on double click', () => {
    renderPane();
    const divider = screen.getByRole('separator');
    fireEvent.keyDown(divider, { key: 'End' });

    fireEvent.doubleClick(divider);
    expect(divider.getAttribute('aria-valuenow')).toBe('50');
  });

  it('has no divider without a side pane', () => {
    renderPane(null);
    expect(screen.queryByRole('separator')).toBeNull();
  });
});
