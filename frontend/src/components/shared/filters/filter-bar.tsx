'use client';

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { FilterItem, FilterValue, Primitive, FilterEntity, DateFilterValue } from '@/lib/filters';

import { FilterField } from './filter-field';

type FilterChangeValue = Primitive | Primitive[] | FilterEntity | FilterEntity[] | DateFilterValue | undefined;

type Props = {
  filterConfig: FilterItem[];
  filters: FilterValue;
  onFilterChange: (key: string, value: FilterChangeValue) => void;
  onClear: () => void;
};

export function FilterBar({ filterConfig, filters, onFilterChange, onClear }: Props) {
  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {filterConfig.map(item => (
        <div key={item.key} className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{item.label}</label>
          <FilterField item={item} value={filters[item.key]} onChange={v => onFilterChange(item.key, v)} />
        </div>
      ))}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={onClear}>
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
