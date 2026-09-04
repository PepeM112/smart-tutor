'use client';

import { useTranslations } from 'next-intl';
import { use } from 'react';

import { NotePage } from '@/features/notes/components/NotePage';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function NoteDetailRoutePage({ params }: Props) {
  const { id } = use(params);
  const t = useTranslations();
  useBreadcrumb(t('notes.note'), [{ label: t('notes.title'), href: Routes.NOTES }], Routes.NOTES);

  return <NotePage noteId={id} />;
}
