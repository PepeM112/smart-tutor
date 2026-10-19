'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useLatestNotifications, useMarkAllRead, useUnreadCount } from '../hooks/useNotifications';
import { badgeText } from '../lib/badge';

import { NotificationItem } from './NotificationItem';

type NotificationBellProps = {
  /** Where the popover opens: the sidebar opens it to the right, the mobile header below. */
  side?: 'bottom' | 'right';
  align?: 'start' | 'end';
  className?: string;
};

/** The bell with the unread badge and a popover with the latest 10 notifications. */
export function NotificationBell({ side = 'bottom', align = 'start', className }: NotificationBellProps) {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const { data: count = 0 } = useUnreadCount();
  const { data, isLoading, isError } = useLatestNotifications(open);
  const { mutate: markAllRead, isPending: isMarkingAll } = useMarkAllRead();
  const items = data?.items ?? [];

  return (
    <FloatingCard open={open} onOpenChange={setOpen}>
      <FloatingCardTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('bell_label', { count })}
          className={cn('relative text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground', className)}
        >
          <Bell size={20} />
          {count > 0 && (
            <span
              aria-hidden
              data-testid="notification-badge"
              className="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-medium text-primary-foreground tabular-nums"
            >
              {badgeText(count)}
            </span>
          )}
        </Button>
      </FloatingCardTrigger>
      <FloatingCardContent side={side} align={align} className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t('title')}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={count === 0 || isMarkingAll}
            onClick={() => markAllRead()}
          >
            {t('mark_all_read')}
          </Button>
        </div>
        <QueryState isLoading={isLoading} isError={isError} errorMessage={t('failed_to_load')}>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
              {items.map(notification => (
                <NotificationItem key={notification.id} notification={notification} onNavigate={() => setOpen(false)} />
              ))}
            </ul>
          )}
        </QueryState>
        <Link
          href={Routes.NOTIFICATIONS}
          onClick={() => setOpen(false)}
          className="self-center text-sm font-medium text-primary hover:underline"
        >
          {t('see_all')}
        </Link>
      </FloatingCardContent>
    </FloatingCard>
  );
}
