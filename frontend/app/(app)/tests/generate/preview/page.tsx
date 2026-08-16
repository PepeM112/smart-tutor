'use client';

import { useTranslations } from 'next-intl';

import { GeneratedTestPreview } from '@/features/tests/components/generated-test-preview';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

export default function GeneratePreviewPage() {
  const t = useTranslations();
  useBreadcrumb(t('test_generation.review_generated'), [{ label: t('notes.title'), href: Routes.NOTES }], Routes.NOTES);

  return <GeneratedTestPreview />;
}
