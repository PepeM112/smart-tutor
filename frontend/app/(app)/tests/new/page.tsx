'use client';
import { useEffect } from 'react';

import { TestEditor } from '@/features/tests/components/test-editor';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function NewTestPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('New Test', [{ label: 'Tests', href: Routes.TESTS }], Routes.TESTS);
    return () => reset();
  }, [set, reset]);

  return <TestEditor />;
}
