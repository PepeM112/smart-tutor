'use client';
import { useEffect } from 'react';
import { use } from 'react';

import { TestEditor } from '@/features/tests/components/test-editor';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

type Props = {
  params: Promise<{ id: string }>;
};

export default function EditTestPage({ params }: Props) {
  const { id } = use(params);
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Edit Test', [{ label: 'Tests', href: Routes.TESTS }], Routes.TESTS);
    return () => reset();
  }, [set, reset]);

  return <TestEditor testId={id} />;
}
