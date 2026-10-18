// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEndSentinel } from './useEndSentinel';

type FakeObserver = {
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

let observers: FakeObserver[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, observe: this.observe, disconnect: this.disconnect });
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const entry = (isIntersecting: boolean): IntersectionObserverEntry[] => [
  { isIntersecting } as IntersectionObserverEntry,
];

/** Renders the hook, and attaches the returned ref to an element, as React does for a `ref` prop. */
function renderSentinel(onReached: () => void, enabled: boolean) {
  const element = document.createElement('div');
  const hook = renderHook(({ enabled: isEnabled }) => useEndSentinel(onReached, isEnabled), {
    initialProps: { enabled },
  });
  hook.result.current(element);
  return {
    element,
    attach: () => hook.result.current(element),
    setEnabled: (next: boolean) => hook.rerender({ enabled: next }),
    detach: () => hook.result.current(null),
  };
}

describe('useEndSentinel', () => {
  it('watches nothing while it is not enabled', () => {
    renderSentinel(vi.fn(), false);

    expect(observers).toHaveLength(0);
  });

  it('calls onReached once when the element is in view, and stops the watch', () => {
    const onReached = vi.fn();
    renderSentinel(onReached, true);
    const [observer] = observers;

    observer.callback(entry(false), {} as IntersectionObserver);
    expect(onReached).not.toHaveBeenCalled();

    observer.callback(entry(true), {} as IntersectionObserver);
    expect(onReached).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('starts the watch only after it is enabled (F2: the editor has content)', () => {
    const sentinel = renderSentinel(vi.fn(), false);
    expect(observers).toHaveLength(0);

    sentinel.setEnabled(true);
    // React calls the new ref callback with the element after the change of `enabled`.
    sentinel.attach();

    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledWith(sentinel.element);
  });

  it('stops the watch when the element goes away', () => {
    const sentinel = renderSentinel(vi.fn(), true);

    sentinel.detach();

    expect(observers[0].disconnect).toHaveBeenCalled();
  });
});
