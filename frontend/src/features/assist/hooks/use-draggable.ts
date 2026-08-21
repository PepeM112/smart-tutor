'use client';

import { useCallback, useRef, useState } from 'react';

type Position = { x: number; y: number };

type UseDraggableReturn = {
  position: Position;
  isDragging: boolean;
  wasDragged: React.RefObject<boolean>;
  handleMouseDown: (e: React.MouseEvent) => void;
  resetPosition: () => void;
  setPosition: (pos: Position) => void;
};

const DEFAULT_POSITION: Position = { x: -1, y: -1 };

export function useDraggable(initialPosition: Position = DEFAULT_POSITION): UseDraggableReturn {
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const wasDraggedRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = (e.target as HTMLElement).closest('[data-assist-panel]');
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const currentX = position.x === -1 ? rect.left : position.x;
      const currentY = position.y === -1 ? rect.top : position.y;

      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        posX: currentX,
        posY: currentY,
      };

      let didMove = false;

      const handleMouseMove = (ev: MouseEvent): void => {
        if (!dragStartRef.current) return;
        const dx = ev.clientX - dragStartRef.current.startX;
        const dy = ev.clientY - dragStartRef.current.startY;
        if (!didMove && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        didMove = true;
        setIsDragging(true);
        setPosition({
          x: Math.max(0, Math.min(dragStartRef.current.posX + dx, window.innerWidth - 100)),
          y: Math.max(0, Math.min(dragStartRef.current.posY + dy, window.innerHeight - 100)),
        });
      };

      const handleMouseUp = (): void => {
        setIsDragging(false);
        dragStartRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        if (didMove) {
          wasDraggedRef.current = true;
          requestAnimationFrame(() => {
            wasDraggedRef.current = false;
          });
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [position]
  );

  const resetPosition = useCallback(() => {
    setPosition(DEFAULT_POSITION);
  }, []);

  return { position, isDragging, wasDragged: wasDraggedRef, handleMouseDown, resetPosition, setPosition };
}
