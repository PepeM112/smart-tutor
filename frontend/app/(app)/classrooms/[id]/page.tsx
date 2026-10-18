'use client';

import { Suspense, use } from 'react';

import { ClassroomPage } from '@/features/classrooms/components/ClassroomPage';
import { parseSlugId } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function ClassroomDetailRoutePage({ params }: Props) {
  const { id } = use(params);
  // ClassroomPage reads `?tab=` (useSearchParams).
  return (
    <Suspense>
      <ClassroomPage classroomId={parseSlugId(id)} />
    </Suspense>
  );
}
