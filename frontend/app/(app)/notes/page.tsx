'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { NoteSource } from '@/client';
import { FilterPopover } from '@/components/shared/filters/FilterPopover';
import { ListPageHeader } from '@/components/shared/ListPageHeader';
import { Pagination } from '@/components/shared/Pagination';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { formatNotesList } from '@/features/assist/utils/formatPageData';
import { GenerateNoteDialog } from '@/features/notes/components/GenerateNoteDialog';
import { ImportNoteButton } from '@/features/notes/components/ImportNoteButton';
import { NotesList } from '@/features/notes/components/NotesList';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useFilters } from '@/hooks/useFilters';
import { useUrlSort } from '@/hooks/useUrlSort';
import { sdk } from '@/lib/apiClient';
import { FilterType, type FilterItem } from '@/lib/filters';
import { Routes } from '@/lib/routes';

const PER_PAGE = 20;

const SOURCE_OPTIONS = [
  { label: 'notes.source_manual', value: NoteSource.USER_CREATED },
  { label: 'notes.source_ai', value: NoteSource.AI_GENERATED },
];

export default function NotesPage() {
  const t = useTranslations();
  useBreadcrumb(t('notes.title'));

  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);
  const { sort, sortBy, sortOrder, handleSort } = useUrlSort(['title', 'updated_at', 'created_at'] as const, resetPage);

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('notes.filter_title'),
        key: 'title',
        type: FilterType.SINGLE,
        query: 'title',
      },
      {
        label: t('notes.filter_content'),
        key: 'content',
        type: FilterType.SINGLE,
        query: 'content',
      },
      {
        label: t('notes.filter_source'),
        key: 'source',
        type: FilterType.TOGGLE,
        query: 'source',
        options: { items: SOURCE_OPTIONS },
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

  const titleFilter = getValue<string>('title');
  const contentFilter = getValue<string>('content');
  const source = getValue<string>('source');

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['notes', { title: titleFilter, content: contentFilter, source, page, sortBy, sortOrder }],
    queryFn: () =>
      sdk.notesList({
        query: {
          title: titleFilter || undefined,
          content: contentFilter || undefined,
          source: source ? [Number(source)] : undefined,
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

  useProvidePageData(useMemo(() => (items.length > 0 ? formatNotesList(items) : null), [items]));
  const isFilteredEmpty = hasActiveFilters && items.length === 0 && !isLoading;

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
            <ImportNoteButton compact />
            <GenerateNoteDialog compact />
            <Button size="lg" icon={Plus} asChild>
              <Link href={Routes.NOTE_NEW}>{t('notes.new_note')}</Link>
            </Button>
          </>
        }
      />

      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('notes.failed_to_load')}>
        {isFilteredEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">{t('notes.no_results')}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
              {t('notes.clear_filters')}
            </Button>
          </div>
        ) : (
          <div className={isFetching ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            <NotesList data={items} sort={sort} onSort={handleSort} />
            <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} disabled={isFetching} />
          </div>
        )}
      </QueryState>
    </div>
  );
}
