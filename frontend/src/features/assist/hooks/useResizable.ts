'use client';

import { useCallback, useRef, useState } from 'react';

import { usePointerDrag } from '@/hooks/usePointerDrag';

type Size = { width: number; height: number };
type Position = { x: number; y: number };
type Edge = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type UseResizableReturn = {
  size: Size;
  isResizing: boolean;
  handleResizeStart: (
    e: React.MouseEvent,
    edge: Edge,
    panelPosition: Position,
    onPositionChange: (pos: Position) => void
  ) => void;
  resetSize: () => void;
};

/** Data of the resize in progress: the start values, the edges that move and where to report the position. */
type ResizeDrag = {
  start: { mouseX: number; mouseY: number; w: number; h: number; posX: number; posY: number };
  touchesLeft: boolean;
  touchesRight: boolean;
  touchesTop: boolean;
  touchesBottom: boolean;
  onPositionChange: (pos: Position) => void;
};

const DEFAULT_SIZE: Size = { width: 460, height: 640 };
const MIN_SIZE: Size = { width: 320, height: 400 };
const MAX_WIDTH = 700;
const VIEWPORT_INSET = 16;

export function useResizable(initialSize: Size = DEFAULT_SIZE): UseResizableReturn {
  const [size, setSize] = useState<Size>(initialSize);
  const dragRef = useRef<ResizeDrag | null>(null);

  const handleMove = useCallback((ev: PointerEvent): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const { start, touchesLeft, touchesRight, touchesTop, touchesBottom } = drag;
    const dx = ev.clientX - start.mouseX;
    const dy = ev.clientY - start.mouseY;

    let newWidth = start.w;
    let newHeight = start.h;

    if (touchesLeft) {
      const maxW = Math.min(MAX_WIDTH, start.w + start.posX - VIEWPORT_INSET);
      newWidth = Math.max(MIN_SIZE.width, Math.min(start.w - dx, maxW));
    } else if (touchesRight) {
      const maxW = Math.min(MAX_WIDTH, window.innerWidth - start.posX - VIEWPORT_INSET);
      newWidth = Math.max(MIN_SIZE.width, Math.min(start.w + dx, maxW));
    }

    if (touchesTop) {
      const maxH = start.h + start.posY - VIEWPORT_INSET;
      newHeight = Math.max(MIN_SIZE.height, Math.min(start.h - dy, maxH));
    } else if (touchesBottom) {
      const maxH = window.innerHeight - start.posY - VIEWPORT_INSET;
      newHeight = Math.max(MIN_SIZE.height, Math.min(start.h + dy, maxH));
    }

    setSize({ width: newWidth, height: newHeight });

    const widthDelta = newWidth - start.w;
    const heightDelta = newHeight - start.h;
    drag.onPositionChange({
      x: start.posX - (touchesLeft ? widthDelta : 0),
      y: start.posY - (touchesTop ? heightDelta : 0),
    });
  }, []);

  const handleEnd = useCallback((): void => {
    dragRef.current = null;
  }, []);

  const { startDrag, isDragging: isResizing } = usePointerDrag({ onMove: handleMove, onEnd: handleEnd });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, edge: Edge, panelPosition: Position, onPositionChange: (pos: Position) => void) => {
      e.preventDefault();
      e.stopPropagation();

      dragRef.current = {
        start: {
          mouseX: e.clientX,
          mouseY: e.clientY,
          w: size.width,
          h: size.height,
          posX: panelPosition.x,
          posY: panelPosition.y,
        },
        touchesLeft: edge === 'left' || edge === 'top-left' || edge === 'bottom-left',
        touchesRight: edge === 'right' || edge === 'top-right' || edge === 'bottom-right',
        touchesTop: edge === 'top' || edge === 'top-left' || edge === 'top-right',
        touchesBottom: edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right',
        onPositionChange,
      };
      startDrag(e);
    },
    [size, startDrag]
  );

  const resetSize = useCallback(() => {
    setSize(DEFAULT_SIZE);
  }, []);

  return { size, isResizing, handleResizeStart, resetSize };
}
