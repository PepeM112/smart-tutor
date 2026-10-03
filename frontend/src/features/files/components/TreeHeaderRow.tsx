import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { TREE_NAME_OFFSET_PX } from '../lib/treeLayout';

type Props = {
  /** Same class as the `TreeActionsCell` of the rows, so the columns line up. */
  actionsWidthClass: string;
  /** The column labels. The first one is the name column and must have `flex-1`. */
  children: ReactNode;
};

/**
 * Column header of a tree table (Files, Trash). It starts at the name offset,
 * so the label lines up with the names, and ends with a spacer for the actions cell.
 */
export function TreeHeaderRow({ actionsWidthClass, children }: Props) {
  return (
    <div
      role="row"
      className="flex items-center gap-2 border-b border-border py-1 pr-2 text-xs font-medium text-muted-foreground"
      style={{ paddingLeft: `${TREE_NAME_OFFSET_PX}px` }}
    >
      {children}
      <span className={cn(actionsWidthClass, 'shrink-0')} />
    </div>
  );
}
