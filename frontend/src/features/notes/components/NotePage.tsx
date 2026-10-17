'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { type NoteRead } from '@/client';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { QueryState } from '@/components/shared/QueryState';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { formatNoteDetail } from '@/features/assist/utils/formatPageData';
import { CourseNoteView } from '@/features/courses/components/CourseNoteView';
import { useCourse } from '@/features/courses/hooks/useCourse';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { errorStatus, retryUnlessDenied } from '@/lib/utils';

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
    retry: retryUnlessDenied,
  });

  const noteData = note?.data;
  // A link to a note can outlive the access to it (a course the user left) or the note itself.
  const status = errorStatus(error);
  const errorMessage =
    status === 403 ? t('notes.no_access') : status === 404 ? t('notes.note_gone') : t('notes.failed_to_load_note');
  useProvidePageData(useMemo(() => (noteData ? formatNoteDetail(noteData) : null), [noteData]));

  return (
    // h-full: FilePageShell and its SplitPane take their height from this wrapper.
    <QueryState className="h-full" isLoading={isLoading} isError={isError} errorMessage={errorMessage}>
      {noteData ? (
        noteData.deletedAt ? (
          <TrashedNoteView key={noteData.id} note={noteData} />
        ) : noteData.spaceId ? (
          <CourseNote key={noteData.id} note={noteData} courseId={noteData.spaceId} />
        ) : (
          <NoteForm key={noteData.id} note={noteData} />
        )
      ) : (
        <p className="text-muted-foreground">{t('notes.note_not_found')}</p>
      )}
    </QueryState>
  );
}

/**
 * A course note. A published note is read-only for everyone (authors change it through edit mode).
 * A draft note opens the editor only while the user can edit the course: an archived course is
 * read-only, and the autosave would fail.
 */
function CourseNote({ note, courseId }: { note: NoteRead; courseId: string }) {
  // The same cache entry as the breadcrumb of `CourseNoteView`.
  const { data: course, isLoading } = useCourse(courseId);

  if (!note.isDraft) return <CourseNoteView note={note} courseId={courseId} />;
  if (isLoading) return <LoadingSpinner />;
  return course?.canEdit ? <NoteForm note={note} /> : <CourseNoteView note={note} courseId={courseId} />;
}
