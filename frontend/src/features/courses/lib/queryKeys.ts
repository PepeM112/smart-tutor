import { type SpaceDetail, type SpacesListMineData } from '@/client';

import type { QueryClient } from '@tanstack/react-query';

export type MyCoursesParams = NonNullable<SpacesListMineData['query']>;

/** Central query key definitions for the courses feature. Every key starts with `['courses']`. */
export const courseQueryKeys = {
  /** ['courses'] — prefix that covers every course query. */
  all: () => ['courses'] as const,
  /** ['courses', 'mine', params?] — courses the user owns or is an active member of. No params = the prefix of every filter. */
  mine: (params?: MyCoursesParams) =>
    params ? (['courses', 'mine', params] as const) : (['courses', 'mine'] as const),
  /** ['courses', 'catalog', params] — a page of the public catalog. */
  catalog: (params: { search: string; sort: string; page: number }) => ['courses', 'catalog', params] as const,
  /** ['courses', 'invitations'] — courses that invited the user. */
  invitations: () => ['courses', 'invitations'] as const,
  /** ['courses', 'detail', id] — one course page. */
  detail: (id: string) => ['courses', 'detail', id] as const,
  /** ['courses', 'detail', id, 'members'] — the member list (authors only). Under the detail key. */
  members: (id: string) => ['courses', 'detail', id, 'members'] as const,
} as const;

/**
 * Put a fresh `SpaceDetail` (most course endpoints return one) into the detail cache,
 * and mark the lists stale: title, status, member count and my role show there too.
 */
export function applyCourseDetail(queryClient: QueryClient, detail: SpaceDetail): void {
  queryClient.setQueryData(courseQueryKeys.detail(detail.id), detail);
  void queryClient.invalidateQueries({ queryKey: courseQueryKeys.mine() });
  void queryClient.invalidateQueries({ queryKey: ['courses', 'catalog'] });
  void queryClient.invalidateQueries({ queryKey: courseQueryKeys.invitations() });
}

/**
 * Mark one course detail stale only (`refetchType: 'none'`), with no refetch of the page that is open.
 * Use it for a change the next visit to the course page must show: a draft note or test saved on
 * another page (its breadcrumb reads the same query and would refetch on every save), or a decline
 * that leaves the page.
 */
export function markCourseDetailStale(queryClient: QueryClient, spaceId: string): void {
  void queryClient.invalidateQueries({ queryKey: courseQueryKeys.detail(spaceId), refetchType: 'none' });
}
