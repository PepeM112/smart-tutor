'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

const DEFAULT_SIZE: Size = { width: 460, height: 640 };
const MIN_SIZE: Size = { width: 320, height: 400 };
const MAX_WIDTH = 700;
const VIEWPORT_INSET = 16;

export function useResizable(initialSize: Size = DEFAULT_SIZE): UseResizableReturn {
  const [size, setSize] = useState<Size>(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef<{
    mouseX: number;
    mouseY: number;
    w: number;
    h: number;
    posX: number;
    posY: number;
  } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, edge: Edge, panelPosition: Position, onPositionChange: (pos: Position) => void) => {
      e.preventDefault();
      e.stopPropagation();

      startRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        w: size.width,
        h: size.height,
        posX: panelPosition.x,
        posY: panelPosition.y,
      };
      setIsResizing(true);

      const touchesLeft = edge === 'left' || edge === 'top-left' || edge === 'bottom-left';
      const touchesRight = edge === 'right' || edge === 'top-right' || edge === 'bottom-right';
      const touchesTop = edge === 'top' || edge === 'top-left' || edge === 'top-right';
      const touchesBottom = edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right';

      const handleMouseMove = (ev: MouseEvent): void => {
        if (!startRef.current) return;
        const dx = ev.clientX - startRef.current.mouseX;
        const dy = ev.clientY - startRef.current.mouseY;

        let newWidth = startRef.current.w;
        let newHeight = startRef.current.h;

        if (touchesLeft) {
          const maxW = Math.min(MAX_WIDTH, startRef.current.w + startRef.current.posX - VIEWPORT_INSET);
          newWidth = Math.max(MIN_SIZE.width, Math.min(startRef.current.w - dx, maxW));
        } else if (touchesRight) {
          const maxW = Math.min(MAX_WIDTH, window.innerWidth - startRef.current.posX - VIEWPORT_INSET);
          newWidth = Math.max(MIN_SIZE.width, Math.min(startRef.current.w + dx, maxW));
        }

        if (touchesTop) {
          const maxH = startRef.current.h + startRef.current.posY - VIEWPORT_INSET;
          newHeight = Math.max(MIN_SIZE.height, Math.min(startRef.current.h - dy, maxH));
        } else if (touchesBottom) {
          const maxH = window.innerHeight - startRef.current.posY - VIEWPORT_INSET;
          newHeight = Math.max(MIN_SIZE.height, Math.min(startRef.current.h + dy, maxH));
        }

        setSize({ width: newWidth, height: newHeight });

        const widthDelta = newWidth - startRef.current.w;
        const heightDelta = newHeight - startRef.current.h;
        onPositionChange({
          x: startRef.current.posX - (touchesLeft ? widthDelta : 0),
          y: startRef.current.posY - (touchesTop ? heightDelta : 0),
        });
      };

      const handleMouseUp = (): void => {
        setIsResizing(false);
        startRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        cleanupRef.current = null;
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      cleanupRef.current = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    },
    [size]
  );

  const resetSize = useCallback(() => {
    setSize(DEFAULT_SIZE);
  }, []);

  return { size, isResizing, handleResizeStart, resetSize };
}
