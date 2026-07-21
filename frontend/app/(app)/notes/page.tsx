'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { Button } from '@/components/ui/button';
import { GenerateNoteDialog } from '@/features/notes/components/generate-note-dialog';
import { ImportNoteButton } from '@/features/notes/components/import-note-button';
import { NotesList } from '@/features/notes/components/notes-list';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

export default function NotesPage() {
  const t = useTranslations('notes');
  useBreadcrumb(t('title'));

  const {
    data: notes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['notes'],
    queryFn: () => sdk.notesList(),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <ImportNoteButton compact />
          <GenerateNoteDialog compact />
          <Button size="lg" icon={Plus} asChild>
            <Link href={Routes.NOTE_NEW}>{t('new_note')}</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <p className="text-muted-foreground">{t('failed_to_load')}</p>
      ) : (
        <NotesList data={notes?.data ?? []} />
      )}
    </div>
  );
}
