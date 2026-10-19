'use client';

import { Suspense } from 'react';

import { NotificationsPage } from '@/features/notifications/components/NotificationsPage';

export default function NotificationsRoutePage() {
  // The filters read the URL (useSearchParams).
  return (
    <Suspense>
      <NotificationsPage />
    </Suspense>
  );
}
