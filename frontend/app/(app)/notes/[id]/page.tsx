'use client';

import { use, useEffect } from 'react';

import { NotePage } from '@/features/notes/components/note-page';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

type Props = {
  params: Promise<{ id: string }>;
};

export default function NoteDetailRoutePage({ params }: Props) {
  const { id } = use(params);
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Note', [{ label: 'Notes', href: Routes.NOTES }], Routes.NOTES);
    return () => reset();
  }, [set, reset]);

  return <NotePage noteId={id} />;
}
