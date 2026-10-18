'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { useCopyNoteToLibrary } from '../hooks/useCopyNoteToLibrary';

/** Any member who can read a course note may copy it. Authors too. */
export function CopyToLibraryButton({ noteId }: { noteId: string }) {
  const t = useTranslations();
  const { mutate: copyToLibrary, isPending: isCopying } = useCopyNoteToLibrary(noteId);

  return (
    <Button
      variant="ghost"
      size="icon"
      tooltip={t('courses.copy_to_library')}
      aria-label={t('courses.copy_to_library')}
      loading={isCopying}
      onClick={() => copyToLibrary()}
    >
      <Copy />
    </Button>
  );
}
