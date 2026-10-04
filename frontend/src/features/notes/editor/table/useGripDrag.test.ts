// @vitest-environment jsdom

// Gesture lifecycle of `useGripDrag`: `isActive` during a gesture, the end of a gesture whose release was
// lost, and the cleanup when the grip unmounts in the middle of a drag (no drop line or overlay lock may stay behind).

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

const target = { setPointerCapture: () => undefined };

/** The pointer down on the grip (a React event). */
const press = (clientX: number) =>
  ({
    button: 0,
    ctrlKey: false,
    pointerId: 1,
    clientX,
    clientY: 0,
    preventDefault: () => undefined,
    currentTarget: target,
  }) as unknown as ReactPointerEvent<HTMLElement>;

/** The rest of the gesture comes to the window. `buttons: 1` while the button is held. */
const send = (type: string, init: { clientX?: number; buttons?: number } = {}) =>
  act(() => {
    window.dispatchEvent(Object.assign(new MouseEvent(type, { clientX: 0, ...init }), { pointerId: 1 }));
  });

describe('useGripDrag', () => {
  it('is active from pointer down to pointer up', () => {
    const { hook, callbacks } = setup();
    expect(hook.result.current.isActive()).toBe(false);

    act(() => hook.result.current.handlers.onPointerDown(press(50)));
    expect(hook.result.current.isActive()).toBe(true);

    send('pointerup', { clientX: 50 });
    expect(hook.result.current.isActive()).toBe(false);
    expect(callbacks.onClick).toHaveBeenCalledWith(false);
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
  });

  it('drops on the gap under the pointer', () => {
    const { hook, callbacks } = setup();
    act(() => hook.result.current.handlers.onPointerDown(press(50)));
    send('pointermove', { clientX: 260, buttons: 1 });
    send('pointerup', { clientX: 260 });

    expect(callbacks.onDrop).toHaveBeenCalledWith(3);
    expect(callbacks.onGapChange).toHaveBeenLastCalledWith(null);
    expect(callbacks.onClick).not.toHaveBeenCalled();
  });

  // Regression: when the browser lost the `pointerup`, the gesture never ended. The drop line and the
  // overlay lock stayed, and the next release ran the drop late.
  it('cancels the drag when a move shows the button is up', () => {
    const { hook, callbacks } = setup();
    act(() => hook.result.current.handlers.onPointerDown(press(50)));
    send('pointermove', { clientX: 260, buttons: 1 });
    send('pointermove', { clientX: 270, buttons: 0 });

    expect(hook.result.current.isActive()).toBe(false);
    expect(callbacks.onGapChange).toHaveBeenLastCalledWith(null);
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);

    // A later release must not complete the old drag.
    send('pointerup', { clientX: 270 });
    expect(callbacks.onDrop).not.toHaveBeenCalled();
  });

  it('cancels the drag on a new press', () => {
    const { hook, callbacks } = setup();
    act(() => hook.result.current.handlers.onPointerDown(press(50)));
    send('pointermove', { clientX: 260, buttons: 1 });
    send('pointerdown', { clientX: 400, buttons: 1 });
    send('pointerup', { clientX: 400 });

    expect(hook.result.current.isActive()).toBe(false);
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(callbacks.onDrop).not.toHaveBeenCalled();
  });

  it('cancels the drag when the window loses focus', () => {
    const { hook, callbacks } = setup();
    act(() => hook.result.current.handlers.onPointerDown(press(50)));
    send('pointermove', { clientX: 260, buttons: 1 });
    act(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });

    expect(hook.result.current.isActive()).toBe(false);
    expect(callbacks.onGapChange).toHaveBeenLastCalledWith(null);
    expect(callbacks.onDrop).not.toHaveBeenCalled();
  });

  it('ends the gesture when the grip unmounts during a drag', () => {
    const { hook, callbacks } = setup();
    act(() => hook.result.current.handlers.onPointerDown(press(50)));
    send('pointermove', { clientX: 260, buttons: 1 });
    expect(callbacks.onGapChange).toHaveBeenLastCalledWith(3);

    hook.unmount();

    expect(callbacks.onGapChange).toHaveBeenLastCalledWith(null);
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(callbacks.onDrop).not.toHaveBeenCalled();

    // The window listeners are gone with the gesture.
    send('pointerup', { clientX: 260 });
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
  });

  it('does nothing on unmount when no gesture runs', () => {
    const { hook, callbacks } = setup();
    hook.unmount();
    expect(callbacks.onEnd).not.toHaveBeenCalled();
  });
});
