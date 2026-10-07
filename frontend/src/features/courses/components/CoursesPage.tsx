'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { type SpaceSummary } from '@/client';
import { Pagination } from '@/components/shared/Pagination';
import { QueryState } from '@/components/shared/QueryState';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { applyCourseDetail, courseQueryKeys } from '../lib/queryKeys';

import { CourseCard } from './CourseCard';
import { CreateCourseDialog } from './CreateCourseDialog';
import { JoinByCodeDialog } from './JoinByCodeDialog';

const CATALOG_PER_PAGE = 24;
const SEARCH_DEBOUNCE_MS = 300;

type CatalogSort = 'newest' | 'members';

/** `/courses`: My courses, the public Catalog and Invitations. Create and Join with code in the header. */
export function CoursesPage() {
  const t = useTranslations();
  useBreadcrumb(t('courses.title'));

  const { data: invitations = [] } = useQuery({
    queryKey: courseQueryKeys.invitations(),
    queryFn: async (): Promise<SpaceSummary[]> => (await sdk.spacesInvitations({ throwOnError: true })).data,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <JoinByCodeDialog />
        <CreateCourseDialog />
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">{t('courses.tab_mine')}</TabsTrigger>
          <TabsTrigger value="catalog">{t('courses.tab_catalog')}</TabsTrigger>
          <TabsTrigger value="invitations">
            {t('courses.tab_invitations')}
            {invitations.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                {invitations.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <MyCoursesTab />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="invitations">
          <InvitationsTab invitations={invitations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CourseGrid({
  courses,
  renderFooter,
}: {
  courses: SpaceSummary[];
  renderFooter?: (course: SpaceSummary) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {courses.map(course => (
        <CourseCard key={course.id} course={course} footer={renderFooter?.(course)} />
      ))}
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

function MyCoursesTab() {
  const t = useTranslations();
  const {
    data: courses = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: courseQueryKeys.mine(),
    queryFn: async (): Promise<SpaceSummary[]> => (await sdk.spacesListMine({ throwOnError: true })).data,
  });

  return (
    <QueryState isLoading={isLoading} isError={isError} errorMessage={t('courses.failed_to_load')}>
      {courses.length === 0 ? <EmptyText>{t('courses.no_courses')}</EmptyText> : <CourseGrid courses={courses} />}
    </QueryState>
  );
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
        <NativeSelect
          value={sort}
          aria-label={t('courses.sort_label')}
          className="w-auto"
          onChange={e => {
            // SAFETY: the two options below are the only values.
            setSort(e.target.value as CatalogSort);
            setPage(1);
          }}
        >
          <option value="newest">{t('courses.sort_newest')}</option>
          <option value="members">{t('courses.sort_members')}</option>
        </NativeSelect>
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

function InvitationsTab({ invitations }: { invitations: SpaceSummary[] }) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { mutate: acceptInvitation, isPending: isAccepting } = useMutation({
    mutationFn: async (courseId: string) =>
      (await sdk.spacesAcceptInvitation({ path: { space_id: courseId }, throwOnError: true })).data,
    onSuccess: detail => {
      applyCourseDetail(queryClient, detail);
      toast.success(t('courses.joined'));
    },
    onError: err => toast.error(getErrorDetail(err, t('courses.failed_to_join'))),
  });

  const { mutate: declineInvitation, isPending: isDeclining } = useMutation({
    mutationFn: (courseId: string) => sdk.spacesDeclineInvitation({ path: { space_id: courseId }, throwOnError: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: courseQueryKeys.invitations() });
      toast.success(t('courses.invitation_declined'));
    },
    onError: err => toast.error(getErrorDetail(err, t('courses.failed_to_save'))),
  });

  if (invitations.length === 0) return <EmptyText>{t('courses.no_invitations')}</EmptyText>;

  return (
    <CourseGrid
      courses={invitations}
      renderFooter={course => (
        <>
          <Button variant="ghost" disabled={isDeclining || isAccepting} onClick={() => declineInvitation(course.id)}>
            {t('courses.decline')}
          </Button>
          <Button disabled={isAccepting || isDeclining} onClick={() => acceptInvitation(course.id)}>
            {t('courses.accept')}
          </Button>
        </>
      )}
    />
  );
}
