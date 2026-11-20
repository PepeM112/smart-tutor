// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOutlineStore } from '@/store/useOutlineStore';

import { OutlineColumn } from './OutlineColumn';

const breakpoint = vi.hoisted(() => ({ isDesktop: false }));
vi.mock('@/hooks/useBreakpoint', () => ({ useBreakpoint: () => breakpoint }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

// Vaul needs layout APIs that jsdom lacks: a plain drawer shows its content while it is open.
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DrawerPortal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('vaul', () => ({
  Drawer: {
    Overlay: () => null,
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

beforeEach(() => {
  breakpoint.isDesktop = false;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The column registers on mount, and register closes the drawer: open it after the render.
const renderOpenDrawer = (): void => {
  renderColumn();
  act(() => useOutlineStore.getState().setDrawerOpen(true));
};

const renderColumn = () =>
  render(
    <OutlineColumn
      storageKey="k"
      label="Contents"
      outline={
        <>
          <button type="button" data-outline-pick>
            pick
          </button>
          <button type="button">plain</button>
        </>
      }
    >
      <p>page</p>
    </OutlineColumn>
  );

describe('Contents drawer', () => {
  it('closes when the reader picks an entry button', () => {
    renderOpenDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'pick' }));
    expect(useOutlineStore.getState().isDrawerOpen).toBe(false);
  });

  it('stays open when the click is on a control that is not an entry', () => {
    renderOpenDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'plain' }));
    expect(useOutlineStore.getState().isDrawerOpen).toBe(true);
  });
});
