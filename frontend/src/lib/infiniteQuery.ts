import { type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Cuts every infinite query under `queryKey` back to its first page, then refetches (with the first
 * page param). Why: after a write (a new post, a read mark), the cursors stored for page 2, 3, ... point
 * into the old order of rows. A refetch of those pages could repeat or skip a row. A list that starts
 * from the first page again has no stale cursor. The user presses "Load more" again for the older rows.
 */
export function resetToFirstPage(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  queryClient.setQueriesData<InfiniteData<unknown>>({ queryKey }, data =>
    data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data
  );
  return queryClient.invalidateQueries({ queryKey });
}
