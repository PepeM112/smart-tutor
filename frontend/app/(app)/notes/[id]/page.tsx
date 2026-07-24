'use client';

import { useTranslations } from 'next-intl';
import { use } from 'react';

import { NotePage } from '@/features/notes/components/note-page';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function NoteDetailRoutePage({ params }: Props) {
  const { id } = use(params);
  const t = useTranslations('notes');
  useBreadcrumb(t('note'), [{ label: t('title'), href: Routes.NOTES }], Routes.NOTES);

  return <NotePage noteId={id} />;
}
