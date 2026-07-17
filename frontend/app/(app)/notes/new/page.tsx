'use client';

import { NewNotePage } from '@/features/notes/components/new-note-page';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { Routes } from '@/lib/routes';

export default function NewNoteRoutePage() {
  useBreadcrumb('New Note', [{ label: 'Notes', href: Routes.NOTES }], Routes.NOTES);

  return <NewNotePage />;
}
