'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { SpaceRole } from '@/client';
import { FilterPopover } from '@/components/shared/filters/FilterPopover';
import { ListPageHeader } from '@/components/shared/ListPageHeader';
import { QueryState } from '@/components/shared/QueryState';
import { CourseCard } from '@/features/courses/components/CourseCard';
import { InvitationsButton } from '@/features/courses/components/InvitationsButton';
import { JoinByCodeDialog } from '@/features/courses/components/JoinByCodeDialog';
import { CLASSROOM_ROLE_LABELS } from '@/features/courses/lib/labels';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useFilters } from '@/hooks/useFilters';
import { FilterType, type FilterItem, type Primitive } from '@/lib/filters';

import { useMyClassrooms } from '../hooks/useClassrooms';
import { type MyClassroomsParams } from '../lib/queryKeys';

import { CreateClassroomDialog } from './CreateClassroomDialog';

const STATUS_OPTIONS = [
  { label: 'courses.filter_status_archived', value: 'archived' },
  { label: 'courses.filter_status_all', value: 'all' },
];

const ROLE_OPTIONS = [SpaceRole.OWNER, SpaceRole.EDITOR, SpaceRole.VIEWER] as const;
const ROLE_FILTER_OPTIONS = ROLE_OPTIONS.map(value => ({ label: CLASSROOM_ROLE_LABELS[value], value }));

/** `/classrooms`: the classrooms of the user. Invitations, Join with code and Create in the header. */
export function ClassroomsPage() {
  const t = useTranslations();
  useBreadcrumb(t('classrooms.title'));

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('courses.filter_status'),
        key: 'status',
        type: FilterType.TOGGLE,
        query: 'status',
        // No status filter = "Active": the backend hides archived classrooms by default.
        options: { items: STATUS_OPTIONS, allLabel: 'courses.filter_status_active' },
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
  const params: MyClassroomsParams = {
    status: toListStatus(getValue<Primitive>('status')),
    role: toRoles(getValue<Primitive[]>('role')),
  };
  const { data: classrooms = [], isLoading, isError } = useMyClassrooms(params);
  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <InvitationsButton />
        <JoinByCodeDialog />
        <CreateClassroomDialog />
      </div>

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
        <QueryState isLoading={isLoading} isError={isError} errorMessage={t('classrooms.failed_to_load')}>
          {classrooms.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {t(hasActiveFilters ? 'classrooms.no_classrooms_filtered' : 'classrooms.no_classrooms')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {classrooms.map(classroom => (
                <CourseCard key={classroom.id} course={classroom} />
              ))}
            </div>
          )}
        </QueryState>
      </div>
    </div>
  );
}

/** The URL can hold any text, so read the status back as one of the known values only. */
function toListStatus(value: Primitive | undefined): MyClassroomsParams['status'] {
  return value === 'archived' || value === 'all' ? value : undefined;
}

/** Keep only the known roles (the URL can hold any number). An empty list means no filter. */
function toRoles(values: Primitive[] | undefined): SpaceRole[] | undefined {
  const result = ROLE_OPTIONS.filter(role => values?.includes(role));
  return result.length > 0 ? result : undefined;
}
