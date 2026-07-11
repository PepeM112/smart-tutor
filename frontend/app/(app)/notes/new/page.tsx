'use client';

import { useEffect } from 'react';

import { NewNotePage } from '@/features/notes/components/new-note-page';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function NewNoteRoutePage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('New Note', [{ label: 'Notes', href: Routes.NOTES }], Routes.NOTES);
    return () => reset();
  }, [set, reset]);

  return <NewNotePage />;
}
