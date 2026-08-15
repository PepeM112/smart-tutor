'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { FilterPopover } from '@/components/shared/filters/filter-popover';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { QuickTestDialog } from '@/features/tests/components/quick-test-dialog';
import { TestsTable } from '@/features/tests/components/tests-table';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { useFilters } from '@/hooks/use-filters';
import { sdk } from '@/lib/api-client';
import { FilterType, type FilterItem } from '@/lib/filters';
import { Routes } from '@/lib/routes';

const PER_PAGE = 20;

export default function TestsPage() {
  const t = useTranslations('tests');
  useBreadcrumb(t('title'));

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const sortBy = searchParams.get('sort_c') ?? undefined;
  const sortOrder = (searchParams.get('sort_o') as 'asc' | 'desc' | null) ?? undefined;

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('filter_search'),
        key: 'search',
        type: FilterType.SINGLE,
        query: 'search',
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

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['tests', { search, page, sortBy, sortOrder }],
    queryFn: () =>
      sdk.testsList({
        query: {
          search: search || undefined,
          page,
          per_page: PER_PAGE,
          sort_by: sortBy as 'title' | 'created_at' | undefined,
          sort_order: sortOrder,
        },
      }),
  });

  const items = response?.data?.items ?? [];
  const total = response?.data?.total ?? 0;
  const hasActiveFilters = Object.keys(filters).length > 0;
  const isFilteredEmpty = hasActiveFilters && items.length === 0 && !isLoading;

  const handleSort = useCallback(
    (column: string | null, order: 'asc' | 'desc' | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (column && order) {
        params.set('sort_c', column);
        params.set('sort_o', order);
      } else {
        params.delete('sort_c');
        params.delete('sort_o');
      }
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      setPage(1);
    },
    [searchParams, pathname, router]
  );

  const sort = useMemo(
    () => ({
      column: sortBy ?? null,
      order: sortOrder ?? null,
    }),
    [sortBy, sortOrder]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-2">
          <FilterPopover
            filterConfig={filterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClear={clearFilters}
          />
        </div>
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <QuickTestDialog compact />
          <Button size="lg" icon={Plus} asChild>
            <Link href={Routes.TEST_NEW}>{t('create_test')}</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <p className="text-muted-foreground">{t('failed_to_load')}</p>
      ) : isFilteredEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">{t('no_results')}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
            {t('clear_filters')}
          </Button>
        </div>
      ) : (
        <div className={isFetching ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          <TestsTable data={items} sort={sort} onSort={handleSort} />
          <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
