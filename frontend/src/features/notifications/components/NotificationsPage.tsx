'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { FilterPopover } from '@/components/shared/filters/FilterPopover';
import { ListPageHeader } from '@/components/shared/ListPageHeader';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useFilters } from '@/hooks/useFilters';
import { FilterType, type FilterItem, type Primitive } from '@/lib/filters';

import { useMarkAllRead, useNotificationPages, useUnreadCount } from '../hooks/useNotifications';

import { NotificationItem } from './NotificationItem';

const UNREAD_VALUE = 'unread';
const READ_FILTER_OPTIONS = [{ label: 'notifications.filter_unread', value: UNREAD_VALUE }];

/** `/notifications`: all notifications, newest first, with an Unread filter, "Mark all read" and "Load more". */
export function NotificationsPage() {
  const t = useTranslations('notifications');
  useBreadcrumb(t('title'));

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('filter_status'),
        key: 'status',
        type: FilterType.TOGGLE,
        query: 'status',
        // No filter = all notifications.
        options: { items: READ_FILTER_OPTIONS },
      },
    ],
    [t]
  );
  const { filters, getValue, setFilter, clearFilters } = useFilters(filterConfig);
  const unreadOnly = getValue<Primitive>('status') === UNREAD_VALUE;

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotificationPages(unreadOnly);
  const { data: unreadCount = 0 } = useUnreadCount();
  const { mutate: markAllRead, isPending: isMarkingAll } = useMarkAllRead();
  const items = data?.pages.flatMap(page => page.items) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <ListPageHeader
        filters={
          <FilterPopover
            filterConfig={filterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClear={clearFilters}
          />
        }
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={unreadCount === 0 || isMarkingAll}
            onClick={() => markAllRead()}
          >
            {t('mark_all_read')}
          </Button>
        }
      />
      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('failed_to_load')} className="flex flex-col">
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t(unreadOnly ? 'empty_unread' : 'empty')}</p>
        ) : (
          <ul className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-2 shadow-card">
            {items.map(notification => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </ul>
        )}
        {hasNextPage && (
          <Button
            type="button"
            variant="outline"
            className="mt-4 self-center"
            loading={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {t('load_more')}
          </Button>
        )}
      </QueryState>
    </div>
  );
}
