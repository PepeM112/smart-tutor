// @vitest-environment jsdom

// Gesture lifecycle of `useGripDrag`: `isActive` during a gesture, and the cleanup when the grip
// unmounts in the middle of a drag (no drop line or overlay lock may stay behind).

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGripDrag } from './useGripDrag';

import type { PointerEvent as ReactPointerEvent } from 'react';

const bands = [
  { start: 0, size: 100 },
  { start: 100, size: 100 },
  { start: 200, size: 100 },
];

function setup() {
  const callbacks = {
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onGapChange: vi.fn(),
    onDrop: vi.fn(),
    onClick: vi.fn(),
  };
  const hook = renderHook(() =>
    useGripDrag({
      axis: 'column',
      draggable: true,
      isOpen: false,
      getBands: () => bands,
      minGap: 0,
      toOffset: event => event.clientX,
      ...callbacks,
    })
  );
  return { hook, callbacks };
}

const target = {
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  hasPointerCapture: () => true,
};

const pointer = (clientX: number) =>
  ({
    button: 0,
    pointerId: 1,
    clientX,
    clientY: 0,
    preventDefault: () => undefined,
    currentTarget: target,
  }) as unknown as ReactPointerEvent<HTMLElement>;

describe('useGripDrag', () => {
  it('is active from pointer down to pointer up', () => {
    const { hook, callbacks } = setup();
    expect(hook.result.current.isActive()).toBe(false);

    act(() => hook.result.current.handlers.onPointerDown(pointer(50)));
    expect(hook.result.current.isActive()).toBe(true);

    act(() => hook.result.current.handlers.onPointerUp(pointer(50)));
    expect(hook.result.current.isActive()).toBe(false);
    expect(callbacks.onClick).toHaveBeenCalledWith(false);
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
  });

  it('ends the gesture when the grip unmounts during a drag', () => {
    const { hook, callbacks } = setup();
    act(() => hook.result.current.handlers.onPointerDown(pointer(50)));
    act(() => hook.result.current.handlers.onPointerMove(pointer(260)));
    expect(callbacks.onGapChange).toHaveBeenLastCalledWith(3);

    hook.unmount();

    expect(callbacks.onGapChange).toHaveBeenLastCalledWith(null);
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(callbacks.onDrop).not.toHaveBeenCalled();
  });

  it('does nothing on unmount when no gesture runs', () => {
    const { hook, callbacks } = setup();
    hook.unmount();
    expect(callbacks.onEnd).not.toHaveBeenCalled();
  });
});
