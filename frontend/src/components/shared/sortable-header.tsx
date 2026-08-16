'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';

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
};

export function SortableHeader({ label, column, sort, onSort }: Props) {
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

  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1 font-medium" onClick={handleClick}>
      {label}
      {isActive ? (
        sort.order === 'asc' ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        )
      ) : (
        <ArrowUpDown className="size-3.5" />
      )}
    </Button>
  );
}
