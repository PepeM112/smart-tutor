// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePointerDrag } from './usePointerDrag';

afterEach(() => {
  cleanup();
  document.body.removeAttribute('style');
});

const pointer = (x: number, pointerId = 1) => ({ button: 0, pointerId, pointerType: 'mouse', clientX: x, clientY: 0 });
const down = (pointerId = 1, button = 0) => ({ button, pointerId }) as unknown as React.PointerEvent;

function setup(options: { cursor?: string } = {}) {
  const onMove = vi.fn<(e: PointerEvent) => void>();
  const onEnd = vi.fn<(e: PointerEvent) => void>();
  const hook = renderHook(() => usePointerDrag({ onMove, onEnd, ...options }));
  return { onMove, onEnd, hook };
}

describe('usePointerDrag', () => {
  it('sends the moves after a drag starts and ends on pointer up', () => {
    const { onMove, onEnd, hook } = setup();

    fireEvent.pointerMove(document, pointer(5));
    expect(onMove).not.toHaveBeenCalled();

    act(() => hook.result.current.startDrag(down()));
    expect(hook.result.current.isDragging).toBe(true);

    fireEvent.pointerMove(document, pointer(20));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0].clientX).toBe(20);

    fireEvent.pointerUp(document, pointer(30));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isDragging).toBe(false);

    fireEvent.pointerMove(document, pointer(40));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('ends on pointer cancel (the browser takes the touch for a scroll)', () => {
    const { onEnd, hook } = setup();
    act(() => hook.result.current.startDrag(down()));
    fireEvent.pointerCancel(document, pointer(0));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('sets the cursor and blocks text selection during the drag, then restores the body', () => {
    document.body.style.cursor = 'help';
    const { hook } = setup({ cursor: 'col-resize' });

    act(() => hook.result.current.startDrag(down()));
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');

    fireEvent.pointerUp(document, pointer(0));
    expect(document.body.style.cursor).toBe('help');
    expect(document.body.style.userSelect).toBe('');
  });

  it('ignores other buttons and other pointers', () => {
    const { onMove, onEnd, hook } = setup();

    act(() => hook.result.current.startDrag(down(1, 2)));
    fireEvent.pointerMove(document, pointer(10));
    expect(onMove).not.toHaveBeenCalled();

    act(() => hook.result.current.startDrag(down(7)));
    fireEvent.pointerMove(document, pointer(10, 8));
    fireEvent.pointerUp(document, pointer(10, 8));
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('uses the latest callbacks', () => {
    const first = vi.fn();
    const second = vi.fn();
    const hook = renderHook(({ onMove }) => usePointerDrag({ onMove }), { initialProps: { onMove: first } });

    act(() => hook.result.current.startDrag(down()));
    hook.rerender({ onMove: second });
    fireEvent.pointerMove(document, pointer(10));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removes the listeners and restores the body when it unmounts in the middle of a drag', () => {
    const { onMove, onEnd, hook } = setup({ cursor: 'col-resize' });
    act(() => hook.result.current.startDrag(down()));

    hook.unmount();

    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    fireEvent.pointerMove(document, pointer(10));
    fireEvent.pointerUp(document, pointer(10));
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
