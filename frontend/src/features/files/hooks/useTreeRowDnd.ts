import {
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  useDndContext,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { useCallback } from 'react';

import { useFilesTree } from '../context/FilesTreeContext';
import { canDrop, type DraggedItem, isDraggedItem } from '../lib/fileTree';

// Unique ID prefixes for dnd-kit draggable / droppable instances.
// `drop:folder:` is also read by the `preferFolderRows` collision logic in FilesTable.
export const FOLDER_DROP_PREFIX = 'drop:folder:';
const dragId = (item: DraggedItem) => `drag:${item.kind}:${item.id}`;
const dropId = (id: string) => `${FOLDER_DROP_PREFIX}${id}`;

type Options = {
  /** Folder rows are drop targets; note rows are not. */
  droppable: boolean;
  /** No drag while renaming: a space typed in the input would start a keyboard drag. */
  renaming: boolean;
};

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

/**
 * DnD wiring shared by folder and note rows: draggable, optionally droppable,
 * one ref for both, and the rules for when DnD is off.
 */
export function useTreeRowDnd(item: DraggedItem, { droppable, renaming }: Options): TreeRowDnd {
  const { folders, isDesktop } = useFilesTree();

  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: dragId(item),
    data: item,
    disabled: !isDesktop || renaming,
    // Keep the treegrid semantics (dnd-kit sets role="button" by default).
    attributes: { role: 'row' },
  });

  // Hooks cannot be conditional, so notes get a permanently disabled droppable.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId(item.id),
    data: { folderId: item.id },
    disabled: !droppable || !isDesktop,
  });

  // The row is the activator node: the keyboard sensor then ignores Enter/Space from child elements.
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setActivatorNodeRef(node);
      if (droppable) setDropRef(node);
    },
    [setDragRef, setActivatorNodeRef, setDropRef, droppable]
  );

  // Read the active drag from context to decide if this row is a valid drop target.
  const { active } = useDndContext();
  const activeData: unknown = active?.data.current;
  const activeDrag = isDraggedItem(activeData) ? activeData : undefined;
  const isValidTarget = droppable && isDesktop && activeDrag ? canDrop(activeDrag, item.id, folders) : false;

  return {
    setRef,
    attributes: isDesktop ? attributes : {},
    listeners: isDesktop ? listeners : undefined,
    isDragging,
    isOver: droppable && isOver,
    isValidTarget,
    isDragActive: active != null,
  };
}
