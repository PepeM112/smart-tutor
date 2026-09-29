import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { type TreeRowDnd } from '../hooks/useTreeRowDnd';

type Props = {
  depth: number;
  dnd: TreeRowDnd;
  onClick: () => void;
  /** Folder rows only: whether the folder is open. */
  expanded?: boolean;
  /** Note rows only: whether the note is in the preview pane. */
  selected?: boolean;
  children: ReactNode;
};

/**
 * The row box shared by folder and note rows: indent, drag props, highlights and tree ARIA.
 * The cells inside come from the row that uses it.
 */
export function TreeRowShell({ depth, dnd, onClick, expanded, selected, children }: Props) {
  const { setRef, attributes, listeners, isDragging, isOver, isValidTarget } = dnd;

  return (
    <div
      ref={setRef}
      role="row"
      {...attributes}
      {...listeners}
      // After the DnD spread, so the tree semantics always win.
      aria-level={depth + 1}
      aria-expanded={expanded}
      aria-selected={selected}
      className={cn(
        'group flex items-center gap-2 py-1.5 pr-2 text-sm rounded-md transition-colors cursor-pointer',
        isDragging ? 'opacity-50' : selected ? 'bg-muted' : 'hover:bg-accent/30',
        isOver && isValidTarget && 'bg-primary/10 ring-1 ring-primary/40'
      )}
      style={{ paddingLeft: `${depth * 16 + 4}px` }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
