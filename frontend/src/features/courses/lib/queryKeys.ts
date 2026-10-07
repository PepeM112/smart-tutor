import { type SpaceDetail } from '@/client';

import type { QueryClient } from '@tanstack/react-query';

/** Central query key definitions for the courses feature. Every key starts with `['courses']`. */
export const courseQueryKeys = {
  /** ['courses'] — prefix that covers every course query. */
  all: () => ['courses'] as const,
  /** ['courses', 'mine'] — courses the user owns or is an active member of. */
  mine: () => ['courses', 'mine'] as const,
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
