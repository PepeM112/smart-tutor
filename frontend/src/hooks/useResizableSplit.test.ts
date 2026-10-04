// @vitest-environment jsdom

import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO, useResizableSplit } from './useResizableSplit';

const KEY = 'test-split';

beforeEach(() => localStorage.clear());
afterEach(() => document.body.removeAttribute('style'));

const keyEvent = (key: string) => ({ key, preventDefault: () => undefined }) as unknown as React.KeyboardEvent;
const down = { button: 0, pointerId: 1, clientX: 0 } as unknown as React.PointerEvent;

describe('useResizableSplit', () => {
  it('moves by a step with the arrow keys, saves it, and stays in the limits', () => {
    const { result } = renderHook(() => useResizableSplit(KEY, 0.5));

    act(() => result.current.handleDividerKeyDown(keyEvent('ArrowRight')));
    expect(result.current.splitRatio).toBeCloseTo(0.52);
    expect(localStorage.getItem(KEY)).toBe(String(result.current.splitRatio));

    act(() => result.current.handleDividerKeyDown(keyEvent('ArrowLeft')));
    expect(result.current.splitRatio).toBeCloseTo(0.5);

    act(() => result.current.handleDividerKeyDown(keyEvent('End')));
    expect(result.current.splitRatio).toBe(MAX_SPLIT_RATIO);
    act(() => result.current.handleDividerKeyDown(keyEvent('ArrowRight')));
    expect(result.current.splitRatio).toBe(MAX_SPLIT_RATIO);

    act(() => result.current.handleDividerKeyDown(keyEvent('Home')));
    expect(result.current.splitRatio).toBe(MIN_SPLIT_RATIO);
  });

  it('ignores other keys', () => {
    const { result } = renderHook(() => useResizableSplit(KEY, 0.5));
    act(() => result.current.handleDividerKeyDown(keyEvent('a')));
    expect(result.current.splitRatio).toBe(0.5);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  // Regression: the saved ratio came from an effect, so a release in the same frame as the last move saved a stale value.
  it('saves the last dragged ratio even if the release comes before a re-render', () => {
    const { result } = renderHook(() => useResizableSplit(KEY, 0.5));
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1000 });
    container.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
    result.current.containerRef.current = container;

    act(() => result.current.handleDividerPointerDown(down));
    act(() => {
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, pointerId: 1 }));
      document.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, pointerId: 1 }));
    });

    expect(localStorage.getItem(KEY)).toBe('0.3');
  });

  it('resets to the default and saves it', () => {
    localStorage.setItem(KEY, '0.7');
    const { result } = renderHook(() => useResizableSplit(KEY, 0.5));
    expect(result.current.splitRatio).toBe(0.7);

    act(() => result.current.resetRatio());
    expect(result.current.splitRatio).toBe(0.5);
    expect(localStorage.getItem(KEY)).toBe('0.5');
  });

  it('is not dragging when it starts', () => {
    const { result } = renderHook(() => useResizableSplit(KEY, 0.5));
    expect(result.current.isDragging).toBe(false);
    fireEvent.pointerMove(document);
  });
});
