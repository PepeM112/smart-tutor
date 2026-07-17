'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { GenerateNoteDialog } from '@/features/notes/components/generate-note-dialog';
import { ImportNoteButton } from '@/features/notes/components/import-note-button';
import { NotesList } from '@/features/notes/components/notes-list';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

export default function NotesPage() {
  useBreadcrumb('Notes');
  const router = useRouter();

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
      <div className="flex items-start justify-between">
        <p className="text-muted-foreground">Create and manage your study notes.</p>
        <div className="flex items-center gap-2">
          <ImportNoteButton />
          <GenerateNoteDialog />
          <Button size="lg" icon={Plus} onClick={() => router.push(Routes.NOTE_NEW)}>
            New Note
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="text-muted-foreground">Failed to load notes. Please try again.</p>
      ) : (
        <NotesList data={notes?.data ?? []} />
      )}
    </div>
  );
}
