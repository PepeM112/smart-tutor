import { useQuery } from '@tanstack/react-query';

import { type TestRead } from '@/client';
import { sdk } from '@/lib/apiClient';

// The backend allows at most 100 items per page.
const PAGE_SIZE = 100;

/** Fetches every test (all pages), for pickers and filter options. */
export function useAllTests(enabled = true) {
  return useQuery({
    // Starts with 'tests', so the existing `invalidateQueries(['tests'])` calls refresh it too.
    queryKey: ['tests', 'all'],
    queryFn: async (): Promise<TestRead[]> => {
      const first = await sdk.testsList({ query: { page: 1, per_page: PAGE_SIZE } });
      const firstPage = first.data;
      if (!firstPage) return [];

      const pageCount = Math.ceil(firstPage.total / PAGE_SIZE);
      const otherPages = await Promise.all(
        Array.from({ length: Math.max(pageCount - 1, 0) }, (_, i) =>
          sdk.testsList({ query: { page: i + 2, per_page: PAGE_SIZE } })
        )
      );
      return [firstPage, ...otherPages.map(res => res.data)].flatMap(page => page?.items ?? []);
    },
    enabled,
  });
}
