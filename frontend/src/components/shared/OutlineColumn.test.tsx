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

describe('Outline card fade', () => {
  const card = (): HTMLElement => screen.getByRole('navigation', { hidden: true }).parentElement!;
  const advance = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };
  // Each phase sets its timer after a render, so every step needs its own `act`.
  const finishFold = (): void => {
    advance(150);
    advance(300);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    breakpoint.isDesktop = true;
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query,
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('close: the card fades out and is inert at once, then the content is removed after the fold', () => {
    renderColumn();
    expect(card().className).toContain('opacity-100');

    act(() => useOutlineStore.getState().setOpen(false));
    expect(card().className).toContain('opacity-0');
    expect(screen.getByRole('navigation', { hidden: true }).hasAttribute('inert')).toBe(true);

    finishFold();
    expect(screen.queryByRole('navigation', { hidden: true })).toBeNull();
  });

  it('open: the card shows at opacity 0 and fades in after the delay', () => {
    renderColumn();
    act(() => useOutlineStore.getState().setOpen(false));
    finishFold();

    act(() => useOutlineStore.getState().setOpen(true));
    expect(card().className).toContain('opacity-0');
    advance(150);
    expect(card().className).toContain('opacity-100');
  });
});
