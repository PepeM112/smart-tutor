'use client';

import { useTranslations } from 'next-intl';

import { NewNotePage } from '@/features/notes/components/NewNotePage';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { Routes } from '@/lib/routes';

export default function NewNoteRoutePage() {
  const t = useTranslations();
  useBreadcrumb(t('notes.new_note'), [{ label: t('notes.title'), href: Routes.NOTES }], Routes.NOTES);

  return <NewNotePage />;
}
