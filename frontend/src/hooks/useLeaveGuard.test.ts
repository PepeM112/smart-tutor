// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLeaveHref, useLeaveGuard } from './useLeaveGuard';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// Same origin as jsdom, so that a relative link counts as an in-app link.
const CURRENT = new URL('/courses/c1/tests/i1', window.location.href);
const plainClick = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

function anchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  Object.entries(attrs).forEach(([key, value]) => a.setAttribute(key, value));
  document.body.appendChild(a);
  return a;
}

afterEach(() => {
  // Vitest globals are off, so Testing Library does not unmount by itself.
  cleanup();
  document.body.innerHTML = '';
  push.mockClear();
});

describe('getLeaveHref', () => {
  it('returns the path of an in-app link', () => {
    expect(getLeaveHref(plainClick, anchor('/courses/c1?tab=members'), CURRENT)).toBe('/courses/c1?tab=members');
  });

  it('finds the link from a child element', () => {
    const a = anchor('/dashboard');
    const span = document.createElement('span');
    a.appendChild(span);
    expect(getLeaveHref(plainClick, span, CURRENT)).toBe('/dashboard');
  });

  it('ignores modified clicks, other targets, downloads, other sites and the same page', () => {
    expect(getLeaveHref({ ...plainClick, ctrlKey: true }, anchor('/x'), CURRENT)).toBeNull();
    expect(getLeaveHref({ ...plainClick, button: 1 }, anchor('/x'), CURRENT)).toBeNull();
    expect(getLeaveHref(plainClick, anchor('/x', { target: '_blank' }), CURRENT)).toBeNull();
    expect(getLeaveHref(plainClick, anchor('/x', { download: '' }), CURRENT)).toBeNull();
    expect(getLeaveHref(plainClick, anchor('https://example.com/x'), CURRENT)).toBeNull();
    expect(getLeaveHref(plainClick, anchor('/courses/c1/tests/i1#top'), CURRENT)).toBeNull();
  });

  it('ignores a click that is not on a link', () => {
    expect(getLeaveHref(plainClick, document.body, CURRENT)).toBeNull();
  });
});

describe('useLeaveGuard', () => {
  it('stops a click on an in-app link and waits for the answer', () => {
    const { result } = renderHook(() => useLeaveGuard(true));
    const link = anchor('/dashboard');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      link.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.pendingHref).toBe('/dashboard');

    act(() => result.current.confirmLeave());
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('lets the user stay', () => {
    const { result } = renderHook(() => useLeaveGuard(true));
    act(() => {
      anchor('/dashboard').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    act(() => result.current.cancelLeave());
    expect(result.current.pendingHref).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('does nothing while it is not active', () => {
    const { result } = renderHook(() => useLeaveGuard(false));
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      anchor('/dashboard').dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('asks the browser before a reload or a tab close', () => {
    renderHook(() => useLeaveGuard(true));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
