import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { TREE_NAME_OFFSET_PX } from './treeLayout';

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
      className="flex min-h-9 items-center gap-2 pr-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
      style={{ paddingLeft: `${TREE_NAME_OFFSET_PX}px` }}
    >
      {children}
      <span className={cn(actionsWidthClass, 'shrink-0')} />
    </div>
  );
}
