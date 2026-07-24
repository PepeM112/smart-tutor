'use client';
import { useTranslations } from 'next-intl';

import { TestEditor } from '@/features/tests/components/test-editor';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

export default function NewTestPage() {
  const t = useTranslations('tests');
  useBreadcrumb(t('new_test'), [{ label: t('title'), href: Routes.TESTS }], Routes.TESTS);

  return <TestEditor />;
}
