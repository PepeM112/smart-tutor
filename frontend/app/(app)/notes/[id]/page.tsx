'use client';

import { use } from 'react';

import { NotePage } from '@/features/notes/components/NotePage';
import { parseSlugId } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function NoteDetailRoutePage({ params }: Props) {
  const { id } = use(params);
  const noteId = parseSlugId(id);
  // Breadcrumb is handled inside NotePage via FileBreadcrumb — no useBreadcrumb here.
  return <NotePage noteId={noteId} />;
}
