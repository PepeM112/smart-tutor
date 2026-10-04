// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResponsiveSplitPane } from './ResponsiveSplitPane';

vi.mock('@/hooks/useBreakpoint', () => ({ useBreakpoint: () => ({ isDesktop: false }) }));

// A drawer that keeps its content mounted, like Vaul does during the close animation.
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    <div data-testid="drawer" data-open={open}>
      {children}
    </div>
  ),
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(cleanup);

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
