// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBreakpoint } from './useBreakpoint';

let listeners: Array<() => void> = [];

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

beforeEach(() => {
  listeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    removeEventListener: (_: string, listener: () => void) => {
      listeners = listeners.filter(l => l !== listener);
    },
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  setWidth(1024);
});

describe('useBreakpoint', () => {
  // Regression: the hook started at 'desktop' and read the width in an effect, so a mobile page showed the
  // desktop layout for one frame.
  it('gives the real breakpoint in the first render', () => {
    setWidth(500);
    const renders: string[] = [];
    renderHook(() => {
      const { breakpoint } = useBreakpoint();
      renders.push(breakpoint);
    });
    expect(renders[0]).toBe('mobile');
  });

  it('updates when the width crosses a breakpoint', () => {
    setWidth(1400);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toMatchObject({ isDesktop: true, isXl: true });

    setWidth(900);
    act(() => listeners.forEach(listener => listener()));
    expect(result.current).toMatchObject({ isTablet: true, isXl: false });
  });

  it('removes its listeners on unmount', () => {
    const { unmount } = renderHook(() => useBreakpoint());
    expect(listeners.length).toBeGreaterThan(0);
    unmount();
    expect(listeners).toHaveLength(0);
  });
});
