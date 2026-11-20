'use client';

import { type ReactNode } from 'react';

import { FilterPopover } from '@/components/shared/filters/FilterPopover';
import { SearchInput } from '@/components/shared/SearchInput';
import type { FilterItem, FilterValue } from '@/lib/filters';

const SEARCH_KEY = 'search';

interface ListToolbarProps {
  /** Omit it for a list with no search: the toolbar then holds the Filters popover only. */
  searchPlaceholder?: string;
  /** The `search` filter is shown as the search field, not inside the Filters popover. */
  filterConfig: FilterItem[];
  filters: FilterValue;
  onFilterChange: (key: string, value: FilterValue[string] | undefined) => void;
  onClear: () => void;
  children?: ReactNode;
}

/** The row above a list: the search field, the Filters popover and optional extra controls. */
export function ListToolbar({
  searchPlaceholder,
  filterConfig,
  filters,
  onFilterChange,
  onClear,
  children,
}: ListToolbarProps) {
  const { [SEARCH_KEY]: searchValue, ...popoverFilters } = filters;

  return (
    <div role="search" className="flex min-h-12 flex-wrap items-center gap-2 py-2">
      {searchPlaceholder && (
        <SearchInput
          className="w-full sm:w-70"
          placeholder={searchPlaceholder}
          value={typeof searchValue === 'string' ? searchValue : ''}
          onChange={value => onFilterChange(SEARCH_KEY, value || undefined)}
        />
      )}
      <FilterPopover
        filterConfig={filterConfig.filter(item => item.key !== SEARCH_KEY)}
        filters={popoverFilters}
        onFilterChange={onFilterChange}
        onClear={onClear}
      />
      {children}
    </div>
  );
}
