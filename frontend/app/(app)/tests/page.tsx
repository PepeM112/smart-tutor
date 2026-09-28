'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { QuestionType } from '@/client';
import { FilterPopover } from '@/components/shared/filters/FilterPopover';
import { ListPageHeader } from '@/components/shared/ListPageHeader';
import { Pagination } from '@/components/shared/Pagination';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { formatTestsList } from '@/features/assist/utils/formatPageData';
import { QuickTestDialog } from '@/features/tests/components/QuickTestDialog';
import { TestsTable } from '@/features/tests/components/TestsTable';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useFilters } from '@/hooks/useFilters';
import { useUrlSort } from '@/hooks/useUrlSort';
import { sdk } from '@/lib/apiClient';
import { FilterType, type DateFilterValue, type FilterItem, type Primitive } from '@/lib/filters';
import { Routes } from '@/lib/routes';

const PER_PAGE = 20;

const QUESTION_TYPE_OPTIONS = [
  { label: 'questions.type_simple', value: QuestionType.SIMPLE },
  { label: 'questions.type_multiple_choice', value: QuestionType.MULTIPLE_CHOICE },
  { label: 'questions.type_long_text', value: QuestionType.LONG_TEXT },
];

export default function TestsPage() {
  const t = useTranslations();
  useBreadcrumb(t('tests.title'));

  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);
  const { sort, sortBy, sortOrder, handleSort } = useUrlSort(['title', 'created_at'] as const, resetPage);

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('tests.filter_search'),
        key: 'search',
        type: FilterType.SINGLE,
        query: 'search',
      },
      {
        label: t('tests.filter_type'),
        key: 'question_type',
        type: FilterType.MULTIPLE_SELECT,
        query: 'question_type',
        options: { items: QUESTION_TYPE_OPTIONS, number: true },
      },
      {
        label: t('tests.filter_date'),
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
  const questionType = getValue<Primitive[]>('question_type');
  const created = getValue<DateFilterValue>('created');

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['tests', { search, questionType, created, page, sortBy, sortOrder }],
    queryFn: () =>
      sdk.testsList({
        query: {
          search: search || undefined,
          question_type: questionType?.length ? (questionType as number[]) : undefined,
          created_from: created?.from ?? undefined,
          created_to: created?.to ?? undefined,
          page,
          per_page: PER_PAGE,
          sort_by: sortBy,
          sort_order: sortOrder,
        },
      }),
  });

  const items = useMemo(() => response?.data?.items ?? [], [response]);
  const total = response?.data?.total ?? 0;
  const hasActiveFilters = Object.keys(filters).length > 0;
  const isFilteredEmpty = hasActiveFilters && items.length === 0 && !isLoading;

  useProvidePageData(useMemo(() => (items.length > 0 ? formatTestsList(items) : null), [items]));

  return (
    <div className="space-y-6">
      <ListPageHeader
        filters={
          <FilterPopover
            filterConfig={filterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClear={clearFilters}
          />
        }
        actions={
          <>
            <QuickTestDialog compact />
            <Button size="lg" icon={Plus} asChild>
              <Link href={Routes.TEST_NEW}>{t('tests.create_test')}</Link>
            </Button>
          </>
        }
      />

      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('tests.failed_to_load')}>
        {isFilteredEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">{t('tests.no_results')}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
              {t('tests.clear_filters')}
            </Button>
          </div>
        ) : (
          <div className={isFetching ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            <TestsTable data={items} sort={sort} onSort={handleSort} />
            <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} disabled={isFetching} />
          </div>
        )}
      </QueryState>
    </div>
  );
}
