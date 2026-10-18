'use client';

import { Suspense } from 'react';

import { ClassroomsPage } from '@/features/classrooms/components/ClassroomsPage';

export default function ClassroomsRoutePage() {
  // The filters read the URL (useSearchParams).
  return (
    <Suspense>
      <ClassroomsPage />
    </Suspense>
  );
}
