'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { type SpaceSummary } from '@/client';
import { FilterPopover } from '@/components/shared/filters/FilterPopover';
import { ListPageHeader } from '@/components/shared/ListPageHeader';
import { Pagination } from '@/components/shared/Pagination';
import { QueryState } from '@/components/shared/QueryState';
import { SearchInput } from '@/components/shared/SearchInput';
import { SortMenu } from '@/components/shared/SortMenu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFilters } from '@/hooks/useFilters';
import { useUrlTab } from '@/hooks/useUrlTab';
import { sdk } from '@/lib/apiClient';
import { FilterType, type FilterItem, type Primitive } from '@/lib/filters';

import { ROLE_LABELS, ROLE_OPTIONS, VISIBILITY_LABELS, VISIBILITY_OPTIONS } from '../lib/labels';
import { courseQueryKeys, type MyCoursesParams } from '../lib/queryKeys';

import { CourseCard } from './CourseCard';
import { CreateCourseDialog } from './CreateCourseDialog';
import { InvitationsButton } from './InvitationsButton';
import { JoinByCodeDialog } from './JoinByCodeDialog';

const CATALOG_PER_PAGE = 24;
const SEARCH_DEBOUNCE_MS = 300;

type CatalogSort = 'newest' | 'members';

const COURSES_TABS = ['mine', 'catalog'] as const;

const STATUS_OPTIONS = [
  { label: 'courses.filter_status_archived', value: 'archived' },
  { label: 'courses.filter_status_all', value: 'all' },
];

const VISIBILITY_FILTER_OPTIONS = VISIBILITY_OPTIONS.map(value => ({ label: VISIBILITY_LABELS[value], value }));
const ROLE_FILTER_OPTIONS = ROLE_OPTIONS.map(value => ({ label: ROLE_LABELS[value], value }));

/** `/courses`: My courses and the public Catalog. Invitations, Join with code and Create in the header. */
export function CoursesPage() {
  const t = useTranslations();
  useBreadcrumb(t('courses.title'));
  const [tab, changeTab] = useUrlTab(COURSES_TABS, 'mine');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <InvitationsButton />
        <JoinByCodeDialog />
        <CreateCourseDialog />
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="mine">{t('courses.tab_mine')}</TabsTrigger>
          <TabsTrigger value="catalog">{t('courses.tab_catalog')}</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <MyCoursesTab />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CourseGrid({ courses }: { courses: SpaceSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {courses.map(course => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

function MyCoursesTab() {
  const t = useTranslations();

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('courses.filter_status'),
        key: 'status',
        type: FilterType.TOGGLE,
        query: 'status',
        // No status filter = "Active": the backend hides archived courses by default.
        options: { items: STATUS_OPTIONS, allLabel: 'courses.filter_status_active' },
      },
      {
        label: t('courses.filter_visibility'),
        key: 'visibility',
        type: FilterType.MULTIPLE_SELECT,
        query: 'visibility',
        options: { items: VISIBILITY_FILTER_OPTIONS, number: true },
      },
      {
        label: t('courses.filter_role'),
        key: 'role',
        type: FilterType.MULTIPLE_SELECT,
        query: 'role',
        options: { items: ROLE_FILTER_OPTIONS, number: true },
      },
    ],
    [t]
  );

  const { filters, getValue, setFilter, clearFilters } = useFilters(filterConfig);
  const params: MyCoursesParams = {
    status: toListStatus(getValue<Primitive>('status')),
    visibility: toEnumValues(getValue<Primitive[]>('visibility'), VISIBILITY_OPTIONS),
    role: toEnumValues(getValue<Primitive[]>('role'), ROLE_OPTIONS),
  };

  const {
    data: courses = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: courseQueryKeys.mine(params),
    queryFn: async (): Promise<SpaceSummary[]> =>
      (await sdk.spacesListMine({ query: params, throwOnError: true })).data,
    placeholderData: previous => previous,
  });

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <ListPageHeader
        filters={
          <FilterPopover
            filterConfig={filterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClear={clearFilters}
          />
        }
      />
      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('courses.failed_to_load')}>
        {courses.length === 0 ? (
          <EmptyText>{t(hasActiveFilters ? 'courses.no_courses_filtered' : 'courses.no_courses')}</EmptyText>
        ) : (
          <CourseGrid courses={courses} />
        )}
      </QueryState>
    </div>
  );
}

/** The URL can hold any text, so read the status back as one of the known values only. */
function toListStatus(value: Primitive | undefined): MyCoursesParams['status'] {
  return value === 'archived' || value === 'all' ? value : undefined;
}

/** Keep only the known enum values (the URL can hold any number). An empty list means no filter. */
function toEnumValues<T extends number>(values: Primitive[] | undefined, known: readonly T[]): T[] | undefined {
  const result = known.filter(value => values?.includes(value));
  return result.length > 0 ? result : undefined;
}

function CatalogTab() {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CatalogSort>('newest');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const params = { search: debouncedSearch, sort, page };

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: courseQueryKeys.catalog(params),
    queryFn: async () =>
      (
        await sdk.spacesCatalog({
          query: { search: debouncedSearch || undefined, sort, page, per_page: CATALOG_PER_PAGE },
          throwOnError: true,
        })
      ).data,
    placeholderData: previous => previous,
  });

  const courses = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={value => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t('courses.search_catalog')}
          className="max-w-sm flex-1"
        />
        <SortMenu
          value={sort}
          options={[
            { value: 'newest', label: t('courses.sort_newest') },
            { value: 'members', label: t('courses.sort_members') },
          ]}
          onChange={next => {
            setSort(next);
            setPage(1);
          }}
        />
      </div>
      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('courses.failed_to_load')}>
        {courses.length === 0 ? (
          <EmptyText>{t('courses.catalog_empty')}</EmptyText>
        ) : (
          <div className={isFetching ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            <CourseGrid courses={courses} />
            <Pagination
              page={page}
              perPage={CATALOG_PER_PAGE}
              total={data?.total ?? 0}
              onPageChange={setPage}
              disabled={isFetching}
            />
          </div>
        )}
      </QueryState>
    </div>
  );
}
