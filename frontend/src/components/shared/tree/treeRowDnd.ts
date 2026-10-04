import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';

/** Drag and drop state of one tree row. A hook in the feature makes it; `TreeRowShell` reads it. */
export type TreeRowDnd = {
  setRef: (node: HTMLElement | null) => void;
  /** Empty on non-desktop, so no DnD props reach the DOM. */
  attributes: DraggableAttributes | Record<string, never>;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
  isOver: boolean;
  /** True when a drag is running and this row is a legal drop target for it. */
  isValidTarget: boolean;
  /** A boolean, not the drag object: dnd-kit gives a new object on renders, which would restart timers. */
  isDragActive: boolean;
};
