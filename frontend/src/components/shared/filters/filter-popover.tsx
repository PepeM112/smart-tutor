'use client';

import { Filter, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import type { FilterItem, FilterValue } from '@/lib/filters';

import { FilterField } from './filter-field';

type Props = {
  filterConfig: FilterItem[];
  filters: FilterValue;
  onFilterChange: (key: string, value: FilterValue[string] | undefined) => void;
  onClear: () => void;
};

export function FilterPopover({ filterConfig, filters, onFilterChange, onClear }: Props) {
  const t = useTranslations('common');
  const activeCount = Object.keys(filters).length;

  return (
    <FloatingCard>
      <FloatingCardTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Filter className="size-3.5" />
          {t('filters')}
          {activeCount > 0 && (
            <span className="ml-0.5 rounded-full bg-foreground text-background px-1.5 py-0.5 text-[10px] font-semibold leading-none">
              {activeCount}
            </span>
          )}
        </Button>
      </FloatingCardTrigger>
      <FloatingCardContent align="start" className="w-72 space-y-4">
        {filterConfig.map(item => (
          <div key={item.key} className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{item.label}</label>
            <FilterField item={item} value={filters[item.key]} onChange={v => onFilterChange(item.key, v)} />
          </div>
        ))}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="w-full gap-1 text-muted-foreground" onClick={onClear}>
            <X className="size-3.5" />
            {t('clear_all')}
          </Button>
        )}
      </FloatingCardContent>
    </FloatingCard>
  );
}
