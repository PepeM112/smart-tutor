'use client';

import { Filter, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { FilterItem, FilterValue } from '@/lib/filters';

import { FilterField } from './filter-field';

type Props = {
  filterConfig: FilterItem[];
  filters: FilterValue;
  onFilterChange: (key: string, value: FilterValue[string] | undefined) => void;
  onClear: () => void;
};

export function FilterPopover({ filterConfig, filters, onFilterChange, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = Object.keys(filters).length;

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setOpen(prev => !prev)}>
        <Filter className="size-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-0.5 rounded-full bg-foreground text-background px-1.5 py-0.5 text-[10px] font-semibold leading-none">
            {activeCount}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-card p-4 shadow-lg space-y-4">
            {filterConfig.map(item => (
              <div key={item.key} className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{item.label}</label>
                <FilterField item={item} value={filters[item.key]} onChange={v => onFilterChange(item.key, v)} />
              </div>
            ))}
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-1 text-muted-foreground"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
              >
                <X className="size-3.5" />
                Clear all
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
