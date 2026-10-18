'use client';

import { use } from 'react';

import { CourseAttemptPage } from '@/features/courses/components/CourseAttemptPage';
import { parseSlugId } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string; itemId: string }>;
};

export default function CourseAttemptRoutePage({ params }: Props) {
  const { id, itemId } = use(params);
  return <CourseAttemptPage courseId={parseSlugId(id)} itemId={itemId} />;
}
