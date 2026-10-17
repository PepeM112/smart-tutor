'use client';

import { Suspense } from 'react';

import { CoursesPage } from '@/features/courses/components/CoursesPage';

export default function CoursesRoutePage() {
  // CoursesPage reads `?tab=` (useSearchParams).
  return (
    <Suspense>
      <CoursesPage />
    </Suspense>
  );
}
