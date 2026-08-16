'use client';

import { useTranslations } from 'next-intl';

import { NewNotePage } from '@/features/notes/components/new-note-page';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

export default function NewNoteRoutePage() {
  const t = useTranslations('notes');
  useBreadcrumb(t('new_note'), [{ label: t('title'), href: Routes.NOTES }], Routes.NOTES);

  return <NewNotePage />;
}
