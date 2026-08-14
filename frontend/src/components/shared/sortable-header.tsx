'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';

type SortDirection = 'asc' | 'desc' | null;

type Props = {
  label: string;
  column: string;
  currentSort: string | null;
  currentOrder: SortDirection;
  onSort: (column: string, order: 'asc' | 'desc') => void;
};

export function SortableHeader({ label, column, currentSort, currentOrder, onSort }: Props) {
  const isActive = currentSort === column;

  function handleClick() {
    if (!isActive) {
      onSort(column, 'asc');
    } else if (currentOrder === 'asc') {
      onSort(column, 'desc');
    } else {
      onSort(column, 'asc');
    }
  }

  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1 font-medium" onClick={handleClick}>
      {label}
      {isActive ? (
        currentOrder === 'asc' ? (
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
