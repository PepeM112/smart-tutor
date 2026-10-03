'use client';

// Pointer-event drag for the column and row grips (no dnd-kit: the table is ProseMirror DOM).
//
// One pointer gesture on a grip ends in one of three ways:
// - it moved less than `DRAG_THRESHOLD` px: a click (`onClick`, opens the menu),
// - it moved more and was released: a drop (`onDrop` with the gap under the pointer),
// - Esc or a pointer cancel: nothing happens.
// While the pointer is captured by the grip, `pointermove` and `pointerup` come to the grip itself.

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { gapFromPoint, type Band } from './tableGeometry';

/** Distance in px that turns a click into a drag. */
export const DRAG_THRESHOLD = 4;

type Session = {
  pointerId: number;
  start: number;
  dragging: boolean;
  cancelled: boolean;
  /** The menu was open when the pointer went down: the click closes it, it must not open it again. */
  wasOpen: boolean;
};

type Options = {
  axis: 'row' | 'column';
  /** The header row cannot be dragged. */
  draggable: boolean;
  isOpen: boolean;
  /** Bands of the lines, in container coordinates. Read at event time, so it is always current. */
  getBands: () => Band[];
  /** Lowest gap a drop can land on. */
  minGap: number;
  /** Pointer coordinate on the drag axis, relative to the container. */
  toOffset: (event: { clientX: number; clientY: number }) => number;
  /** A gesture starts: select the line and freeze the overlay. */
  onStart: () => void;
  /** The gesture ended (any way): unfreeze the overlay. */
  onEnd: () => void;
  /** The gap under the pointer while dragging, `null` when the drag stops. */
  onGapChange: (gap: number | null) => void;
  onDrop: (gap: number) => void;
  onClick: (wasOpen: boolean) => void;
};

export type GripPointerHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
};

export type GripDrag = {
  /** Spread on the grip button. */
  handlers: GripPointerHandlers;
  /** A gesture (click or drag) runs now. `onEnd` unfreezes the overlay at its end, not the caller. */
  isActive: () => boolean;
};

export function useGripDrag(options: Options): GripDrag {
  // Latest options in a ref: the handlers keep one identity, and never read stale values.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const session = useRef<Session | null>(null);
  const gap = useRef<number | null>(null);
  const stopEscape = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    stopEscape.current?.();
    stopEscape.current = null;
    session.current = null;
    gap.current = null;
    optionsRef.current.onGapChange(null);
    optionsRef.current.onEnd();
  }, []);

  // The grip can unmount during a gesture: the table was deleted, or its column scrolled out of the wrapper.
  // End the gesture, so no Esc listener, drop line or overlay lock stays behind.
  useEffect(
    () => () => {
      if (session.current) finish();
    },
    [finish]
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || session.current) return;
    // Keeps the editor focus and stops Radix from opening the menu on pointer down: the menu opens on click.
    event.preventDefault();
    const o = optionsRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    session.current = {
      pointerId: event.pointerId,
      start: o.axis === 'column' ? event.clientX : event.clientY,
      dragging: false,
      cancelled: false,
      wasOpen: o.isOpen,
    };
    o.onStart();

    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== 'Escape' || !session.current?.dragging) return;
      key.preventDefault();
      key.stopPropagation();
      session.current.cancelled = true;
      gap.current = null;
      optionsRef.current.onGapChange(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    stopEscape.current = () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = session.current;
    const o = optionsRef.current;
    if (!current || current.pointerId !== event.pointerId || current.cancelled || !o.draggable) return;

    const position = o.axis === 'column' ? event.clientX : event.clientY;
    if (!current.dragging && Math.abs(position - current.start) < DRAG_THRESHOLD) return;
    current.dragging = true;

    const next = gapFromPoint(o.getBands(), o.toOffset(event), o.minGap);
    if (next !== gap.current) {
      gap.current = next;
      o.onGapChange(next);
    }
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dropGap = gap.current;
      const { dragging, cancelled, wasOpen } = current;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const o = optionsRef.current;
      finish();

      if (cancelled) return;
      if (dragging) {
        if (dropGap !== null) o.onDrop(dropGap);
        return;
      }
      o.onClick(wasOpen);
    },
    [finish]
  );

  const onPointerCancel = useCallback(() => {
    if (session.current) finish();
  }, [finish]);

  const isActive = useCallback(() => session.current !== null, []);

  return { handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, isActive };
}
