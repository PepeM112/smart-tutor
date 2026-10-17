import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type SpaceDetail } from '@/client';
import { sdk } from '@/lib/apiClient';
import { retryUnlessDenied } from '@/lib/utils';

import { courseQueryKeys } from '../lib/queryKeys';

/** One course page. The cache holds the `SpaceDetail` itself, so mutations can replace it (`applyCourseDetail`). */
export function useCourse(courseId: string): UseQueryResult<SpaceDetail> {
  return useQuery({
    queryKey: courseQueryKeys.detail(courseId),
    // `throwOnError: true` in the call types `data` as always set (the client throws on errors anyway).
    queryFn: async (): Promise<SpaceDetail> =>
      (await sdk.spacesGet({ path: { space_id: courseId }, throwOnError: true })).data,
    retry: retryUnlessDenied,
  });
}
