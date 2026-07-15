'use client';

import { useEffect } from 'react';

import { GeneratedTestPreview } from '@/features/tests/components/generated-test-preview';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function GeneratePreviewPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Review Generated Questions', [{ label: 'Notes', href: Routes.NOTES }], Routes.NOTES);
    return () => reset();
  }, [set, reset]);

  return <GeneratedTestPreview />;
}
