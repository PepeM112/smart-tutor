import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type CursorPageNotificationRead } from '@/client';
import { sdk } from '@/lib/apiClient';
import { resetToFirstPage } from '@/lib/infiniteQuery';
import { getErrorDetail } from '@/lib/utils';

import { notificationQueryKeys } from '../lib/queryKeys';

/** Items in the bell popover. */
export const POPOVER_LIMIT = 10;
/** Items per page on the `/notifications` page. */
const PAGE_LIMIT = 20;
/** The bell asks for the unread count this often (ms). It is the only polling in the app. */
export const UNREAD_COUNT_INTERVAL_MS = 30_000;

/**
 * The number on the bell. The same request makes the due-soon notifications. It does not purge old read
 * rows: only the list fetch does.
 */
export function useUnreadCount(): UseQueryResult<number> {
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: async (): Promise<number> => (await sdk.notificationsUnreadCount({ throwOnError: true })).data.count,
    refetchInterval: UNREAD_COUNT_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

/** The latest notifications for the bell popover. `enabled` is the popover state: no request while it is closed. */
export function useLatestNotifications(enabled: boolean): UseQueryResult<CursorPageNotificationRead> {
  return useQuery({
    queryKey: notificationQueryKeys.latest(),
    queryFn: async (): Promise<CursorPageNotificationRead> =>
      (await sdk.notificationsListNotifications({ query: { limit: POPOVER_LIMIT }, throwOnError: true })).data,
    enabled,
  });
}

/** The pages of the `/notifications` page, newest first (`fetchNextPage` = "Load more"). */
export function useNotificationPages(
  unreadOnly: boolean
): UseInfiniteQueryResult<InfiniteData<CursorPageNotificationRead, string | null>> {
  return useInfiniteQuery({
    queryKey: notificationQueryKeys.pages(unreadOnly),
    queryFn: async ({ pageParam }): Promise<CursorPageNotificationRead> =>
      (
        await sdk.notificationsListNotifications({
          query: { unread_only: unreadOnly, limit: PAGE_LIMIT, ...(pageParam ? { cursor: pageParam } : {}) },
          throwOnError: true,
        })
      ).data,
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor,
  });
}

/**
 * After a write, the `/notifications` pages restart from the first page (their cursors are stale: with the
 * Unread filter a read row also leaves the list) and the count and the popover refresh.
 */
function useRefreshNotifications(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void resetToFirstPage(queryClient, notificationQueryKeys.allPages());
    void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
    void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.latest() });
  };
}

/** Marks one notification as read. The count and every list refresh after it. */
export function useMarkRead(): UseMutationResult<unknown, unknown, string> {
  const t = useTranslations('notifications');
  const refresh = useRefreshNotifications();

  return useMutation({
    mutationFn: (id: string) => sdk.notificationsMarkRead({ path: { notification_id: id }, throwOnError: true }),
    onSuccess: refresh,
    onError: err => toast.error(getErrorDetail(err, t('failed_to_mark_read'))),
  });
}

export function useMarkAllRead(): UseMutationResult<unknown, unknown, void> {
  const t = useTranslations('notifications');
  const refresh = useRefreshNotifications();

  return useMutation({
    mutationFn: () => sdk.notificationsMarkAllRead({ throwOnError: true }),
    onSuccess: () => {
      refresh();
      toast.success(t('all_marked_read'));
    },
    onError: err => toast.error(getErrorDetail(err, t('failed_to_mark_read'))),
  });
}
