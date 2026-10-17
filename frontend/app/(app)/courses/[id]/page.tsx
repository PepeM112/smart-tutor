'use client';

import { Suspense, use } from 'react';

import { CoursePage } from '@/features/courses/components/CoursePage';
import { parseSlugId } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function CourseDetailRoutePage({ params }: Props) {
  const { id } = use(params);
  // CoursePage reads `?tab=` (useSearchParams).
  return (
    <Suspense>
      <CoursePage courseId={parseSlugId(id)} />
    </Suspense>
  );
}
