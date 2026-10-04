'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type PointerDragOptions = {
  /** Called for each pointer move while the drag is active. */
  onMove: (e: PointerEvent) => void;
  /** Called once when the pointer is released or the browser cancels it. Not called on unmount. */
  onEnd?: (e: PointerEvent) => void;
  /** Body cursor during the drag (the pointer often leaves the handle). */
  cursor?: string;
};

type UsePointerDragReturn = {
  /** Call it from `onPointerDown` (a `mousedown` event works too, but it has no touch or pen). */
  startDrag: (e: React.MouseEvent) => void;
  isDragging: boolean;
};

/**
 * Drag logic for resize handles and movable panels. It listens on `document`, so the drag goes on
 * when the pointer leaves the handle. Pointer events cover mouse, touch and pen. Give the handle
 * `touch-none`, or the browser scrolls instead of sending moves.
 *
 * During the drag the body gets `cursor` and `user-select: none`; both go back at the end.
 * `onMove` and `onEnd` can be new functions on each render: the latest ones are used.
 */
export function usePointerDrag({ onMove, onEnd, cursor }: PointerDragOptions): UsePointerDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const latest = useRef({ onMove, onEnd, cursor });
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    latest.current = { onMove, onEnd, cursor };
  });

  // Remove the listeners and restore the body. Safe to call when no drag is active.
  const teardown = useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;
  }, []);

  // A drag still active at unmount must not leave listeners or a locked body behind.
  useEffect(() => teardown, [teardown]);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      // Only the main button. A right click opens the context menu and the release never arrives.
      if (e.button !== 0) return;
      teardown();

      // Follow only the pointer that started the drag (a second finger must not move it).
      const pointerId = 'pointerId' in e ? (e.pointerId as number) : undefined;
      const isTracked = (ev: PointerEvent): boolean => pointerId === undefined || ev.pointerId === pointerId;

      const { style } = document.body;
      const previous = { cursor: style.cursor, userSelect: style.userSelect };
      if (latest.current.cursor) style.cursor = latest.current.cursor;
      style.userSelect = 'none';

      const handleMove = (ev: PointerEvent): void => {
        if (isTracked(ev)) latest.current.onMove(ev);
      };
      const handleEnd = (ev: PointerEvent): void => {
        if (!isTracked(ev)) return;
        teardown();
        setIsDragging(false);
        latest.current.onEnd?.(ev);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleEnd);
      document.addEventListener('pointercancel', handleEnd);
      teardownRef.current = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleEnd);
        document.removeEventListener('pointercancel', handleEnd);
        style.cursor = previous.cursor;
        style.userSelect = previous.userSelect;
      };
      setIsDragging(true);
    },
    [teardown]
  );

  return { startDrag, isDragging };
}
