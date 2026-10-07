'use client';

import { use } from 'react';

import { CoursePage } from '@/features/courses/components/CoursePage';
import { parseSlugId } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function CourseDetailRoutePage({ params }: Props) {
  const { id } = use(params);
  return <CoursePage courseId={parseSlugId(id)} />;
}
