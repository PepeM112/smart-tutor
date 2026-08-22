'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Size = { width: number; height: number };
type Position = { x: number; y: number };

type UseResizableReturn = {
  size: Size;
  isResizing: boolean;
  handleResizeStart: (
    e: React.MouseEvent,
    edge: 'top' | 'left' | 'top-left',
    panelPosition: Position,
    onPositionChange: (pos: Position) => void
  ) => void;
  resetSize: () => void;
};

const DEFAULT_SIZE: Size = { width: 460, height: 640 };
const MIN_SIZE: Size = { width: 320, height: 400 };
const MAX_WIDTH = 700;
const VIEWPORT_INSET = 12;

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
    (
      e: React.MouseEvent,
      edge: 'top' | 'left' | 'top-left',
      panelPosition: Position,
      onPositionChange: (pos: Position) => void
    ) => {
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

      const handleMouseMove = (ev: MouseEvent): void => {
        if (!startRef.current) return;
        const dx = startRef.current.mouseX - ev.clientX;
        const dy = startRef.current.mouseY - ev.clientY;

        const maxW = Math.min(MAX_WIDTH, startRef.current.w + startRef.current.posX - VIEWPORT_INSET);
        const maxH = startRef.current.h + startRef.current.posY - VIEWPORT_INSET;
        const newWidth =
          edge === 'left' || edge === 'top-left'
            ? Math.max(MIN_SIZE.width, Math.min(startRef.current.w + dx, maxW))
            : startRef.current.w;
        const newHeight =
          edge === 'top' || edge === 'top-left'
            ? Math.max(MIN_SIZE.height, Math.min(startRef.current.h + dy, maxH))
            : startRef.current.h;

        setSize({ width: newWidth, height: newHeight });

        const widthDelta = newWidth - startRef.current.w;
        const heightDelta = newHeight - startRef.current.h;
        onPositionChange({
          x: startRef.current.posX - (edge === 'left' || edge === 'top-left' ? widthDelta : 0),
          y: startRef.current.posY - (edge === 'top' || edge === 'top-left' ? heightDelta : 0),
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
