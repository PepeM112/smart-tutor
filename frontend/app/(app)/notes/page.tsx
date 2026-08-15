'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { NoteSource } from '@/client';
import { FilterPopover } from '@/components/shared/filters/filter-popover';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { GenerateNoteDialog } from '@/features/notes/components/generate-note-dialog';
import { ImportNoteButton } from '@/features/notes/components/import-note-button';
import { NotesList } from '@/features/notes/components/notes-list';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { useFilters } from '@/hooks/use-filters';
import { useUrlSort } from '@/hooks/use-url-sort';
import { sdk } from '@/lib/api-client';
import { FilterType, type FilterItem } from '@/lib/filters';
import { Routes } from '@/lib/routes';

const PER_PAGE = 20;

const SOURCE_OPTIONS = [
  { label: 'notes.source_manual', value: NoteSource.USER_CREATED },
  { label: 'notes.source_ai', value: NoteSource.AI_GENERATED },
];

export default function NotesPage() {
  const t = useTranslations('notes');
  useBreadcrumb(t('title'));

  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);
  const { sort, sortBy, sortOrder, handleSort } = useUrlSort(
    ['title', 'updated_at', 'created_at'] as const,
    resetPage,
  );

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('filter_search'),
        key: 'search',
        type: FilterType.SINGLE,
        query: 'search',
      },
      {
        label: t('filter_source'),
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

  const search = getValue<string>('search');
  const source = getValue<string>('source');

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['notes', { search, source, page, sortBy, sortOrder }],
    queryFn: () =>
      sdk.notesList({
        query: {
          search: search || undefined,
          source: source ? [Number(source)] : undefined,
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
        <div className="flex items-center gap-2">
          <FilterPopover
            filterConfig={filterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClear={clearFilters}
          />
        </div>
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <ImportNoteButton compact />
          <GenerateNoteDialog compact />
          <Button size="lg" icon={Plus} asChild>
            <Link href={Routes.NOTE_NEW}>{t('new_note')}</Link>
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
          <NotesList data={items} sort={sort} onSort={handleSort} />
          <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} disabled={isFetching} />
        </div>
      )}
    </div>
  );
}
