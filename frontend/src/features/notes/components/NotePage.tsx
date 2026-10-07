'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { QueryState } from '@/components/shared/QueryState';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { formatNoteDetail } from '@/features/assist/utils/formatPageData';
import { CourseNoteView } from '@/features/courses/components/CourseNoteView';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';

import { NoteForm } from './NoteForm';
import { TrashedNoteView } from './TrashedNoteView';

type Props = {
  noteId: string;
};

export function NotePage({ noteId }: Props) {
  const t = useTranslations();
  const {
    data: note,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: fileQueryKeys.note(noteId),
    queryFn: () => sdk.notesGet({ path: { note_id: noteId } }),
    refetchOnWindowFocus: true,
  });

  const noteData = note?.data;
  // A link to a note can outlive the access to it (a course the user left) or the note itself.
  const errorStatus = (error as { status?: number } | null)?.status;
  const errorMessage =
    errorStatus === 403
      ? t('notes.no_access')
      : errorStatus === 404
        ? t('notes.note_gone')
        : t('notes.failed_to_load_note');
  useProvidePageData(useMemo(() => (noteData ? formatNoteDetail(noteData) : null), [noteData]));

  return (
    // h-full: FilePageShell and its SplitPane take their height from this wrapper.
    <QueryState className="h-full" isLoading={isLoading} isError={isError} errorMessage={errorMessage}>
      {noteData ? (
        noteData.deletedAt ? (
          <TrashedNoteView key={noteData.id} note={noteData} />
        ) : noteData.spaceId && !noteData.isDraft ? (
          <CourseNoteView key={noteData.id} note={noteData} courseId={noteData.spaceId} />
        ) : (
          <NoteForm key={noteData.id} note={noteData} />
        )
      ) : (
        <p className="text-muted-foreground">{t('notes.note_not_found')}</p>
      )}
    </QueryState>
  );
}
