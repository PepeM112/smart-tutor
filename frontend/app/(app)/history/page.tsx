'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { FilterPopover } from '@/components/shared/filters/filter-popover';
import { Pagination } from '@/components/shared/pagination';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { HistoryTable } from '@/features/history/components/history-table';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { useFilters } from '@/hooks/use-filters';
import { useUrlSort } from '@/hooks/use-url-sort';
import { sdk } from '@/lib/api-client';
import { FilterType, type DateFilterValue, type FilterItem, type RangeFilterValue } from '@/lib/filters';

const PER_PAGE = 20;

export default function HistoryPage() {
  const t = useTranslations('history');
  useBreadcrumb(t('title'));

  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);
  const { sort, sortBy, sortOrder, handleSort } = useUrlSort(['score', 'created_at'] as const, resetPage);

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('filter_search'),
        key: 'search',
        type: FilterType.SINGLE,
        query: 'search',
      },
      {
        label: t('filter_score'),
        key: 'score',
        type: FilterType.RANGE,
        query: 'score',
      },
      {
        label: t('filter_date'),
        key: 'created',
        type: FilterType.DATE,
        query: 'created',
      },
    ],
    [t]
  );

  const { filters, getValue, setFilter: rawSetFilter, clearFilters: rawClearFilters } = useFilters(filterConfig);

  const setFilter = useCallback(
    (key: string, value: Parameters<typeof rawSetFilter>[1]) => {
      rawSetFilter(key, value);
      setPage(1);
    },
    [rawSetFilter]
  );

  const clearFilters = useCallback(() => {
    rawClearFilters();
    setPage(1);
  }, [rawClearFilters]);

  const search = getValue<string>('search');
  const score = getValue<RangeFilterValue>('score');
  const created = getValue<DateFilterValue>('created');

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['results', { search, score, created, page, sortBy, sortOrder }],
    queryFn: () =>
      sdk.resultsList({
        query: {
          search: search || undefined,
          score_min: score?.min ?? undefined,
          score_max: score?.max ?? undefined,
          created_from: created?.from ?? undefined,
          created_to: created?.to ?? undefined,
          page,
          per_page: PER_PAGE,
          sort_by: sortBy,
          sort_order: sortOrder,
        },
      }),
  });

  const items = response?.data?.items ?? [];
  const total = response?.data?.total ?? 0;
  const hasActiveFilters = Object.keys(filters).length > 0;
  const isFilteredEmpty = hasActiveFilters && items.length === 0 && !isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <FilterPopover
          filterConfig={filterConfig}
          filters={filters}
          onFilterChange={setFilter}
          onClear={clearFilters}
        />
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('failed_to_load')}>
        {isFilteredEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">{t('no_results')}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
              {t('clear_filters')}
            </Button>
          </div>
        ) : (
          <div className={isFetching ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            <HistoryTable data={items} sort={sort} onSort={handleSort} />
            <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} disabled={isFetching} />
          </div>
        )}
      </QueryState>
    </div>
  );
}
