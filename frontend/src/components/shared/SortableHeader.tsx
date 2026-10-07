'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc' | null;

export type SortState = {
  column: string | null;
  order: SortDirection;
};

type Props = {
  label: string;
  column: string;
  sort: SortState;
  onSort: (column: string | null, order: SortDirection) => void;
  /** Small button for the dense `DataTableV2` header (`text-xs`). The default look does not change. */
  compact?: boolean;
};

export function SortableHeader({ label, column, sort, onSort, compact = false }: Props) {
  const isActive = sort.column === column;

  // Cycle: ASC → DESC → clear
  function handleClick() {
    if (!isActive) {
      onSort(column, 'asc');
    } else if (sort.order === 'asc') {
      onSort(column, 'desc');
    } else {
      onSort(null, null);
    }
  }

  const iconClass = compact ? 'size-3' : 'size-3.5';

  return (
    <Button
      variant="ghost"
      size="sm"
      // Compact: equal side margins cancel the button padding, so the label lines up with the cells in any alignment.
      className={cn('gap-1 font-medium', compact ? '-mx-2 h-6 px-2 text-xs' : '-ml-3 h-8')}
      onClick={handleClick}
    >
      {label}
      {isActive ? (
        sort.order === 'asc' ? (
          <ArrowUp className={iconClass} />
        ) : (
          <ArrowDown className={iconClass} />
        )
      ) : (
        <ArrowUpDown className={iconClass} />
      )}
    </Button>
  );
}
