'use client';

import { GeneratedTestPreview } from '@/features/tests/components/generated-test-preview';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

export default function GeneratePreviewPage() {
  useBreadcrumb('Review Generated Questions', [{ label: 'Notes', href: Routes.NOTES }], Routes.NOTES);

  return <GeneratedTestPreview />;
}
