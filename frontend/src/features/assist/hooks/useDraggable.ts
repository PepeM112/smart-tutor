'use client';

import { useCallback, useRef, useState } from 'react';

import { usePointerDrag } from '@/hooks/usePointerDrag';

type Position = { x: number; y: number };

type Size = { width: number; height: number };

/** Pointer and panel values at the start of a drag. */
type DragStart = { startX: number; startY: number; posX: number; posY: number; width: number; height: number };

type UseDraggableReturn = {
  position: Position;
  isDragging: boolean;
  wasDragged: React.RefObject<boolean>;
  handleMouseDown: (e: React.MouseEvent) => void;
  resetPosition: () => void;
  setPosition: (pos: Position) => void;
};

const DEFAULT_POSITION: Position = { x: -1, y: -1 };
const VIEWPORT_INSET = 16;

export function useDraggable(initialPosition: Position = DEFAULT_POSITION, panelSize?: Size): UseDraggableReturn {
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragStart | null>(null);
  const didMoveRef = useRef(false);
  const wasDraggedRef = useRef(false);

  const handleMove = (ev: PointerEvent): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (!didMoveRef.current && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    didMoveRef.current = true;
    setIsDragging(true);
    const pw = panelSize?.width ?? drag.width;
    const ph = panelSize?.height ?? drag.height;
    setPosition({
      x: Math.max(VIEWPORT_INSET, Math.min(drag.posX + dx, window.innerWidth - pw - VIEWPORT_INSET)),
      y: Math.max(VIEWPORT_INSET, Math.min(drag.posY + dy, window.innerHeight - ph - VIEWPORT_INSET)),
    });
  };

  const handleEnd = (): void => {
    setIsDragging(false);
    dragRef.current = null;

    if (didMoveRef.current) {
      wasDraggedRef.current = true;
      requestAnimationFrame(() => {
        wasDraggedRef.current = false;
      });
    }
  };

  // `isDragging` here starts after the 3 px threshold, so the one of the hook is not used.
  const { startDrag } = usePointerDrag({ onMove: handleMove, onEnd: handleEnd });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = (e.target as HTMLElement).closest('[data-assist-panel]');
      if (!el) return;

      const rect = el.getBoundingClientRect();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        posX: position.x === -1 ? rect.left : position.x,
        posY: position.y === -1 ? rect.top : position.y,
        width: rect.width,
        height: rect.height,
      };
      didMoveRef.current = false;
      startDrag(e);
    },
    [position, startDrag]
  );

  const resetPosition = useCallback(() => {
    setPosition(DEFAULT_POSITION);
  }, []);

  return { position, isDragging, wasDragged: wasDraggedRef, handleMouseDown, resetPosition, setPosition };
}
