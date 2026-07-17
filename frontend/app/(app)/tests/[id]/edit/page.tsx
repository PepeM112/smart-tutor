'use client';
import { use } from 'react';

import { TestEditor } from '@/features/tests/components/test-editor';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function EditTestPage({ params }: Props) {
  const { id } = use(params);
  useBreadcrumb('Edit Test', [{ label: 'Tests', href: Routes.TESTS }], Routes.TESTS);

  return <TestEditor testId={id} />;
}
