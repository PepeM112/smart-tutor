'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Send } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { QuestionType } from '@/client';
import { FilterPopover } from '@/components/shared/filters/filter-popover';
import { Pagination } from '@/components/shared/pagination';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useProvidePageData } from '@/features/assist/hooks/use-provide-page-data';
import { formatQuestionsList } from '@/features/assist/utils/format-page-data';
import { AssignDialog } from '@/features/questions/components/assign-dialog';
import { QuestionsTable } from '@/features/questions/components/questions-table';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { useFilters } from '@/hooks/use-filters';
import { useUrlSort } from '@/hooks/use-url-sort';
import { sdk } from '@/lib/api-client';
import { FilterType, type FilterItem, type Primitive } from '@/lib/filters';
import { Routes } from '@/lib/routes';

const PER_PAGE = 25;

const QUESTION_TYPE_OPTIONS = [
  { label: 'questions.type_simple', value: QuestionType.SIMPLE },
  { label: 'questions.type_multiple_choice', value: QuestionType.MULTIPLE_CHOICE },
  { label: 'questions.type_long_text', value: QuestionType.LONG_TEXT },
];

const GROUPING_OPTIONS = [
  { label: 'questions.grouping_grouped', value: 'grouped' },
  { label: 'questions.grouping_standalone', value: 'ungrouped' },
];

export default function QuestionsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  useBreadcrumb(t('questions.title'));

  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);
  const { sort, sortBy, sortOrder, handleSort } = useUrlSort(
    ['prompt', 'question_type', 'points', 'created_at'] as const,
    resetPage
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  const { data: testsResponse } = useQuery({
    queryKey: ['tests'],
    queryFn: () => sdk.testsList({ query: { per_page: 100 } }),
  });

  const testOptions = useMemo(() => {
    const tests = testsResponse?.data?.items ?? [];
    const options: { label: string; value: Primitive }[] = [{ label: t('questions.bank'), value: 'bank' }];
    tests.forEach(test => options.push({ label: test.title, value: test.id }));
    return options;
  }, [testsResponse, t]);

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('questions.filter_search'),
        key: 'search',
        type: FilterType.SINGLE,
        query: 'search',
      },
      {
        label: t('questions.filter_type'),
        key: 'question_type',
        type: FilterType.MULTIPLE_SELECT,
        query: 'question_type',
        options: { items: QUESTION_TYPE_OPTIONS, number: true },
      },
      {
        label: t('questions.filter_test'),
        key: 'test_id',
        type: FilterType.MULTIPLE_SELECT,
        query: 'test_id',
        options: { items: testOptions },
      },
      {
        label: t('questions.filter_grouping'),
        key: 'grouping',
        type: FilterType.TOGGLE,
        query: 'grouping',
        options: { items: GROUPING_OPTIONS },
      },
    ],
    [t, testOptions]
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

  const questionType = getValue<Primitive[]>('question_type');
  const testId = getValue<Primitive[]>('test_id');
  const search = getValue<string>('search');
  const grouping = getValue<string>('grouping') as 'grouped' | 'ungrouped' | undefined;

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['questions', { questionType, testId, search, grouping, page, sortBy, sortOrder }],
    queryFn: () =>
      sdk.questionsList({
        query: {
          question_type: questionType?.map(Number) ?? undefined,
          test_id: testId?.map(String) ?? undefined,
          search: search || undefined,
          grouping: grouping || undefined,
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

  useProvidePageData(useMemo(() => (items.length > 0 ? formatQuestionsList(items) : null), [items]));

  const { mutate: bulkDelete, isPending: isBulkDeleting } = useMutation({
    mutationFn: (ids: string[]) => sdk.questionsBulkDelete({ body: { questionIds: ids } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(t('questions.bulk_deleted'));
      setSelectedIds(new Set());
    },
    onError: () => toast.error(t('questions.failed_to_delete')),
  });

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
          <Button size="lg" icon={Plus} asChild>
            <Link href={Routes.QUESTION_NEW}>{t('questions.new_question')}</Link>
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-2">
          <span className="text-sm font-medium">{t('questions.selected_count', { count: selectedIds.size })}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" icon={Send} onClick={() => setBulkAssignOpen(true)}>
              {t('questions.bulk_assign')}
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm" icon={Trash2} disabled={isBulkDeleting}>
                  {t('questions.bulk_delete')}
                </Button>
              }
              title={t('questions.bulk_delete')}
              description={t('questions.bulk_delete_confirm', { count: selectedIds.size })}
              confirmLabel={t('common.delete')}
              confirmClassName="bg-destructive text-white hover:bg-destructive/90"
              onConfirm={() => bulkDelete([...selectedIds])}
            />
          </div>
        </div>
      )}

      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('questions.failed_to_load')}>
        {isFilteredEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">{t('questions.no_results')}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
              {t('questions.clear_filters')}
            </Button>
          </div>
        ) : (
          <div className={isFetching ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            <QuestionsTable
              data={items}
              sort={sort}
              onSort={handleSort}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
            <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} disabled={isFetching} />
          </div>
        )}
      </QueryState>

      {bulkAssignOpen && selectedIds.size > 0 && (
        <AssignDialog
          questionIds={[...selectedIds]}
          open={bulkAssignOpen}
          onOpenChange={open => {
            if (!open) setBulkAssignOpen(false);
          }}
          onSuccess={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}
