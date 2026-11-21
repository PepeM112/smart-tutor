'use client';

import { useTranslations } from 'next-intl';

import { SandboxGallery } from '@/features/sandbox/components/SandboxGallery';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

export default function SandboxPage() {
  const t = useTranslations();
  useBreadcrumb(t('sidebar.sandbox'), [{ label: t('sidebar.admin') }]);

  return <SandboxGallery />;
}
