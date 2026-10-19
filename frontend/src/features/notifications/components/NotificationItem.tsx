'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { type NotificationRead } from '@/client';
import { formatRelativeTime } from '@/lib/relativeTime';
import { cn } from '@/lib/utils';

import { useMarkRead } from '../hooks/useNotifications';
import { renderNotification } from '../lib/renderers';

type NotificationItemProps = {
  notification: NotificationRead;
  /** Runs on a click, after the link is followed (the popover closes itself with it). */
  onNavigate?: () => void;
};

/** One row of the bell popover and of the `/notifications` page. A click marks it read and opens its page. */
export function NotificationItem({ notification, onNavigate }: NotificationItemProps) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const { mutate: markRead } = useMarkRead();
  const { textKey, params, href, icon: Icon } = renderNotification(notification);
  const isUnread = notification.readAt === null;

  return (
    <li>
      <Link
        href={href}
        data-testid="notification-item"
        data-unread={isUnread}
        onClick={() => {
          if (isUnread) markRead(notification.id);
          onNavigate?.();
        }}
        className={cn(
          'flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
          isUnread && 'bg-muted/50'
        )}
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className={cn('line-clamp-3 text-sm break-words text-foreground', isUnread && 'font-medium')}>
            {t(textKey, params)}
          </p>
          <time
            dateTime={notification.createdAt.toISOString()}
            title={notification.createdAt.toLocaleString(locale)}
            className="text-xs text-muted-foreground"
          >
            {formatRelativeTime(notification.createdAt, locale)}
          </time>
        </div>
        {isUnread && (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" role="img" aria-label={t('unread')} />
        )}
      </Link>
    </li>
  );
}
