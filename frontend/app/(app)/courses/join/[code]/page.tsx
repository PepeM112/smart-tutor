'use client';

import { use } from 'react';

import { JoinByCodePage } from '@/features/courses/components/JoinByCodePage';

type Props = {
  params: Promise<{ code: string }>;
};

export default function CourseJoinRoutePage({ params }: Props) {
  const { code } = use(params);
  return <JoinByCodePage code={decodeURIComponent(code)} />;
}
