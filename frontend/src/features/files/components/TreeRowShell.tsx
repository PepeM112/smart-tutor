import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { type TreeRowDnd } from '../hooks/useTreeRowDnd';
import { TREE_INDENT_STEP_PX, TREE_ROW_BASE_PADDING_PX } from '../lib/treeLayout';

type Props = {
  depth: number;
  /** Leave it out for a row with no drag and drop (the tree view in Trash). */
  dnd?: TreeRowDnd;
  /** Leave it out for a row that does nothing on click: it then has no pointer cursor. */
  onClick?: () => void;
  /** Folder rows only: whether the folder is open. */
  expanded?: boolean;
  /** Note rows only: whether the note is in the preview pane. */
  selected?: boolean;
  children: ReactNode;
};

const NO_DND: TreeRowDnd = {
  setRef: () => undefined,
  attributes: {},
  listeners: undefined,
  isDragging: false,
  isOver: false,
  isValidTarget: false,
  isDragActive: false,
};

/**
 * The row box shared by folder and note rows: indent, drag props, highlights and tree ARIA.
 * The cells inside come from the row that uses it.
 */
export function TreeRowShell({ depth, dnd, onClick, expanded, selected, children }: Props) {
  const { setRef, attributes, listeners, isDragging, isOver, isValidTarget } = dnd ?? NO_DND;

  return (
    <div
      ref={setRef}
      {...attributes}
      {...listeners}
      // After the DnD spread. On desktop the hook already sets role="row". Below the desktop
      // breakpoint the hook returns no attributes, so this line keeps the role on all rows.
      role="row"
      aria-level={depth + 1}
      aria-expanded={expanded}
      aria-selected={selected}
      className={cn(
        'group flex items-center gap-2 py-1.5 pr-2 text-sm rounded-md transition-colors',
        onClick && 'cursor-pointer',
        isDragging ? 'opacity-50' : selected ? 'bg-muted' : 'hover:bg-accent/30',
        isOver && isValidTarget && 'bg-primary/10 ring-1 ring-primary/40'
      )}
      style={{ paddingLeft: `${depth * TREE_INDENT_STEP_PX + TREE_ROW_BASE_PADDING_PX}px` }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
