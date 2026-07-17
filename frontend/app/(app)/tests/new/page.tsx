'use client';
import { TestEditor } from '@/features/tests/components/test-editor';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

export default function NewTestPage() {
  useBreadcrumb('New Test', [{ label: 'Tests', href: Routes.TESTS }], Routes.TESTS);

  return <TestEditor />;
}
