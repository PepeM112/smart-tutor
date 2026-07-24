'use client';

import { useTranslations } from 'next-intl';

import { GeneratedTestPreview } from '@/features/tests/components/generated-test-preview';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

export default function GeneratePreviewPage() {
  const t = useTranslations('test_generation');
  const tNotes = useTranslations('notes');
  useBreadcrumb(t('review_generated'), [{ label: tNotes('title'), href: Routes.NOTES }], Routes.NOTES);

  return <GeneratedTestPreview />;
}
