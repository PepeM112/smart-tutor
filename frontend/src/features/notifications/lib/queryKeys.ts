/** Query keys of the notifications feature. Every key starts with `['notifications']`. */
export const notificationQueryKeys = {
  all: ['notifications'] as const,
  /** ['notifications', 'unread-count'] — the number on the bell. */
  unreadCount: () => ['notifications', 'unread-count'] as const,
  /** ['notifications', 'latest'] — the bell popover (the latest 10, one request). */
  latest: () => ['notifications', 'latest'] as const,
  /** ['notifications', 'pages'] — prefix of every cursor-paged list of the `/notifications` page. */
  allPages: () => ['notifications', 'pages'] as const,
  /** ['notifications', 'pages', unreadOnly] — the cursor pages of the `/notifications` page. */
  pages: (unreadOnly: boolean) => ['notifications', 'pages', unreadOnly] as const,
} as const;
