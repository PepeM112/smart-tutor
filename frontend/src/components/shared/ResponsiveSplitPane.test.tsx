// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponsiveSplitPane } from './ResponsiveSplitPane';

const breakpoint = vi.hoisted(() => ({ isDesktop: false }));
vi.mock('@/hooks/useBreakpoint', () => ({ useBreakpoint: () => breakpoint }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

// A drawer that keeps its content mounted, like Vaul does during the close animation.
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    <div data-testid="drawer" data-open={open}>
      {children}
    </div>
  ),
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  breakpoint.isDesktop = false;
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

const renderPane = (side: React.ReactNode) => (
  <ResponsiveSplitPane storageKey="k" main={<p>main</p>} side={side} onSideClose={() => undefined} />
);

describe('ResponsiveSplitPane drawer', () => {
  it('keeps the last side content while the drawer closes', () => {
    const { rerender } = render(renderPane(<p>detail</p>));
    expect(screen.getByTestId('drawer').getAttribute('data-open')).toBe('true');

    rerender(renderPane(null));

    expect(screen.getByTestId('drawer').getAttribute('data-open')).toBe('false');
    expect(screen.queryByText('detail')).not.toBeNull();
  });

  it('shows the new content when the drawer opens again', () => {
    const { rerender } = render(renderPane(<p>first</p>));
    rerender(renderPane(null));
    rerender(renderPane(<p>second</p>));

    expect(screen.queryByText('second')).not.toBeNull();
    expect(screen.queryByText('first')).toBeNull();
  });
});

describe('ResponsiveSplitPane across the lg breakpoint', () => {
  const renderWithInput = () => (
    <ResponsiveSplitPane storageKey="k" main={<input aria-label="note" />} side={null} onSideClose={() => undefined} />
  );

  it('keeps the typed value of main when the window crosses lg', () => {
    breakpoint.isDesktop = true;
    const { rerender } = render(renderWithInput());
    fireEvent.change(screen.getByLabelText('note'), { target: { value: 'half a sentence' } });

    breakpoint.isDesktop = false;
    rerender(renderWithInput());

    expect(screen.getByLabelText<HTMLInputElement>('note').value).toBe('half a sentence');
  });

  it('keeps the same input element, not a copy', () => {
    breakpoint.isDesktop = true;
    const { rerender } = render(renderWithInput());
    const input = screen.getByLabelText('note');

    breakpoint.isDesktop = false;
    rerender(renderWithInput());

    expect(screen.getByLabelText('note')).toBe(input);
  });
});
