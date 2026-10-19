import { InfiniteQueryObserver, QueryClient, type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { resetToFirstPage } from './infiniteQuery';

type Page = { items: number[]; next: number | null };

/** A server with a list of ids, newest first, paged with a strict `id < cursor` cursor (like the backend). */
function makeServer(initial: number[]) {
  const rows = [...initial];
  const fetchPage = vi.fn((cursor: number | null): Promise<Page> => {
    const rest = rows.filter(id => cursor === null || id < cursor);
    const items = rest.slice(0, 3);
    return Promise.resolve({ items, next: rest.length > 3 ? items[items.length - 1] : null });
  });
  return { rows, fetchPage };
}

describe('resetToFirstPage', () => {
  it('drops the old cursors, so a new row at the top does not repeat or skip a row', async () => {
    const server = makeServer([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const queryClient = new QueryClient();
    const observer = new InfiniteQueryObserver<Page, Error, InfiniteData<Page, number | null>, string[], number | null>(
      queryClient,
      {
        queryKey: ['feed'],
        queryFn: ({ pageParam }) => server.fetchPage(pageParam),
        initialPageParam: null,
        getNextPageParam: last => last.next,
      }
    );
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(observer.getCurrentResult().data?.pages).toHaveLength(1));
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().data?.pages).toHaveLength(2);

    server.rows.unshift(10);
    await resetToFirstPage(queryClient, ['feed']);

    const data = queryClient.getQueryData<InfiniteData<Page>>(['feed']);
    expect(data?.pages).toHaveLength(1);
    expect(data?.pageParams).toEqual([null]);
    expect(data?.pages[0].items).toEqual([10, 9, 8]);

    await observer.fetchNextPage();
    const all = observer.getCurrentResult().data?.pages.flatMap(p => p.items);
    expect(all).toEqual([10, 9, 8, 7, 6, 5]);
    unsubscribe();
  });

  it('leaves a query without data alone, and only touches the given key', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['other'], { pages: [1, 2], pageParams: [null, 2] });

    await resetToFirstPage(queryClient, ['feed']);

    expect(queryClient.getQueryData(['feed'])).toBeUndefined();
    expect(queryClient.getQueryData<InfiniteData<number>>(['other'])?.pages).toEqual([1, 2]);
  });
});
