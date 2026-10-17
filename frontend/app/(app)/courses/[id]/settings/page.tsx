'use client';

import { use } from 'react';

import { CourseSettingsPage } from '@/features/courses/components/CourseSettingsPage';
import { parseSlugId } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function CourseSettingsRoutePage({ params }: Props) {
  const { id } = use(params);
  return <CourseSettingsPage courseId={parseSlugId(id)} />;
}
