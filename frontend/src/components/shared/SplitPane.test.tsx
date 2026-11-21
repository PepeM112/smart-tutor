// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  describe('staged fade', () => {
    const sidePanel = (): HTMLElement => screen.getByText('side').parentElement!;
    const divider = (): HTMLElement => screen.getByRole('separator', { hidden: true });
    const advance = (ms: number): void => {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    };
    const closed = <SplitPane storageKey={KEY} main={<p>main</p>} side={null} />;
    const open = <SplitPane storageKey={KEY} main={<p>main</p>} side={<p>side</p>} />;

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('close: the content fades out first, then the width folds, then the content is removed', () => {
      const { rerender } = renderPane();
      expect(sidePanel().className).toContain('opacity-100');

      rerender(closed);
      expect(sidePanel().className).toContain('opacity-0');
      expect(divider().className).toContain('w-9');

      advance(149);
      expect(divider().className).toContain('w-9');
      advance(1);
      expect(divider().className).toContain('w-0');
      expect(screen.queryByText('side')).not.toBeNull();

      advance(300);
      expect(screen.queryByText('side')).toBeNull();
    });

    it('open: the width starts at once and the content shows only after the delay', () => {
      const { rerender } = renderPane(null);

      rerender(open);
      expect(divider().className).toContain('w-9');
      expect(sidePanel().className).toContain('opacity-0');

      advance(149);
      expect(sidePanel().className).toContain('opacity-0');
      advance(1);
      expect(sidePanel().className).toContain('opacity-100');
    });

    it('has no delay and no fade class with reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        media: query,
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
      const { rerender } = renderPane(null);

      rerender(open);
      advance(0);
      expect(sidePanel().className).toContain('opacity-100');
      expect(sidePanel().className).toContain('motion-reduce:transition-none');

      rerender(closed);
      advance(0);
      advance(0);
      advance(0);
      expect(screen.queryByText('side')).toBeNull();
    });
  });

  it('resets the saved ratio on double click', () => {
    localStorage.setItem(KEY, '0.7');
    render(<SplitPane storageKey={KEY} defaultRatio={0.4} main={<p>main</p>} side={<p>side</p>} />);

    fireEvent.doubleClick(screen.getByRole('separator'));

    expect(localStorage.getItem(KEY)).toBe('0.4');
  });
});
