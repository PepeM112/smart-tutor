'use client';

// Pointer-event drag for the column and row grips (no dnd-kit: the table is ProseMirror DOM).
//
// One pointer gesture on a grip ends in one of three ways:
// - it moved less than `DRAG_THRESHOLD` px: a click (`onClick`, opens the menu),
// - it moved more and was released: a drop (`onDrop` with the gap under the pointer),
// - Esc, a pointer cancel or a lost release (see below): nothing happens.
//
// The gesture listens on the window, not on the grip. A browser can lose the `pointerup` of the grip: a release
// outside the window, a switch to another app, a ctrl + click that opens the macOS context menu. When the gesture
// waited for that `pointerup` only, it never ended: the drop line, the overlay lock and the selected grip stayed,
// and the next release on the grip ran the drop late, at the old gap. So the gesture also ends when the window
// sees that the button is up (`buttons`), a new press, or the window losing focus. These ends cancel: a late
// drop would move the line to a gap that the user no longer sees.
// The grip still captures the pointer, so the moves do not hover (and lock) the other controls.

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { gapFromPoint, type Band } from './tableGeometry';

/** Distance in px that turns a click into a drag. */
const DRAG_THRESHOLD = 4;

type Session = {
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

export type GripDrag = {
  /** Spread on the grip button. */
  handlers: { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void };
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
  const stopListening = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    stopListening.current?.();
    stopListening.current = null;
    session.current = null;
    gap.current = null;
    optionsRef.current.onGapChange(null);
    optionsRef.current.onEnd();
  }, []);

  // The grip can unmount during a gesture: the table was deleted, or its column scrolled out of the wrapper.
  // End the gesture, so no window listener, drop line or overlay lock stays behind.
  useEffect(
    () => () => {
      if (session.current) finish();
    },
    [finish]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Ctrl + click is the right click of macOS: the context menu opens and takes the release.
      // No check for an old session: the window `pointerdown` listener (capture) ended it before this handler.
      if (event.button !== 0 || event.ctrlKey) return;
      // Keeps the editor focus and stops Radix from opening the menu on pointer down: the menu opens on click.
      event.preventDefault();
      const o = optionsRef.current;
      const { pointerId } = event;
      event.currentTarget.setPointerCapture(pointerId);
      session.current = {
        start: o.axis === 'column' ? event.clientX : event.clientY,
        dragging: false,
        cancelled: false,
        wasOpen: o.isOpen,
      };
      o.onStart();

      const onMove = (move: PointerEvent) => {
        const current = session.current;
        const latest = optionsRef.current;
        if (!current || move.pointerId !== pointerId) return;
        // The primary button is up, but no `pointerup` came: the release was lost.
        if ((move.buttons & 1) === 0) {
          finish();
          return;
        }
        if (current.cancelled || !latest.draggable) return;

        const position = latest.axis === 'column' ? move.clientX : move.clientY;
        if (!current.dragging && Math.abs(position - current.start) < DRAG_THRESHOLD) return;
        current.dragging = true;

        const next = gapFromPoint(latest.getBands(), latest.toOffset(move), latest.minGap);
        if (next !== gap.current) {
          gap.current = next;
          latest.onGapChange(next);
        }
      };

      const onUp = (up: PointerEvent) => {
        const current = session.current;
        if (!current || up.pointerId !== pointerId) return;
        const dropGap = gap.current;
        const { dragging, cancelled, wasOpen } = current;
        const latest = optionsRef.current;
        finish();

        if (cancelled) return;
        if (dragging) {
          if (dropGap !== null) latest.onDrop(dropGap);
          return;
        }
        latest.onClick(wasOpen);
      };

      const onCancel = (cancel: PointerEvent) => {
        if (cancel.pointerId === pointerId) finish();
      };

      // Added while this pointer down is dispatched, so only a later press comes here: the release was lost.
      const onPress = () => finish();

      // With capture, the `blur` of every element comes here. Only the window losing focus (its target is not a
      // node) ends the gesture.
      const onBlur = (blur: FocusEvent) => {
        if (!(blur.target instanceof Node)) finish();
      };

      const onKeyDown = (key: KeyboardEvent) => {
        if (key.key !== 'Escape' || !session.current?.dragging) return;
        key.preventDefault();
        key.stopPropagation();
        session.current.cancelled = true;
        gap.current = null;
        optionsRef.current.onGapChange(null);
      };

      const listeners: [string, EventListener][] = [
        ['pointermove', onMove as EventListener],
        ['pointerup', onUp as EventListener],
        ['pointercancel', onCancel as EventListener],
        ['pointerdown', onPress],
        ['blur', onBlur as EventListener],
        ['keydown', onKeyDown as EventListener],
      ];
      listeners.forEach(([type, listener]) => window.addEventListener(type, listener, true));
      stopListening.current = () =>
        listeners.forEach(([type, listener]) => window.removeEventListener(type, listener, true));
    },
    [finish]
  );

  const isActive = useCallback(() => session.current !== null, []);

  return { handlers: { onPointerDown }, isActive };
}
