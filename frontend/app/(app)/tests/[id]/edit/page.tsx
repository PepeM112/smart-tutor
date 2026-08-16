'use client';
import { useTranslations } from 'next-intl';
import { use } from 'react';

import { TestEditor } from '@/features/tests/components/test-editor';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function EditTestPage({ params }: Props) {
  const { id } = use(params);
  const t = useTranslations('tests');
  useBreadcrumb(t('edit_test'), [{ label: t('title'), href: Routes.TESTS }], Routes.TESTS);

  return <TestEditor testId={id} />;
}
