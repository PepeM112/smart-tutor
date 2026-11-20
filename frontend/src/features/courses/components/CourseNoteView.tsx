'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { type NoteRead } from '@/client';
import { NoteWidthToggle } from '@/features/notes/components/NoteWidthToggle';
import { LazyRichNoteEditor } from '@/features/notes/editor/LazyRichNoteEditor';
import { noteColumnClass, useNoteColumn } from '@/features/notes/hooks/useNoteColumn';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { usePageActions, usePageLead } from '@/hooks/usePageActions';
import { displayTitle } from '@/lib/displayTitle';
import { pageBleed } from '@/lib/pageBleed';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { type SentinelRef } from '../hooks/useEndSentinel';
import { useNoteReadProgress } from '../hooks/useNoteReadProgress';
import { spaceHref } from '../lib/spaceHref';

import { CopyToLibraryButton } from './CopyToLibraryButton';
import { CourseNoteBreadcrumb } from './CourseNoteBreadcrumb';
import { NoteDoneButton } from './CourseProgress';

/**
 * A published course note, as a page of its own. It is read-only for every member: authors change it through
 * the course edit mode (a draft twin), so members never see a half-done edit.
 */
export function CourseNoteView({ note, courseId }: { note: NoteRead; courseId: string }) {
  const t = useTranslations();
  const { isDesktop, isFullWidth, toggleWidth } = useNoteColumn();
  const { course, item, endRef, onEditorReady, onUnmark } = useNoteReadProgress(note.id, courseId);

  useBreadcrumb(displayTitle(note.title, t), undefined, course ? spaceHref(course) : Routes.COURSES);
  const lead = useMemo(
    () => <CourseNoteBreadcrumb courseId={courseId} noteTitle={note.title} />,
    [courseId, note.title]
  );
  usePageLead(lead);
  // Not memoized: the done button reads the latest course progress.
  usePageActions(
    <>
      <CopyToLibraryButton noteId={note.id} />
      {course && item && <NoteDoneButton course={course} item={item} onUnmark={onUnmark} />}
      {isDesktop && <NoteWidthToggle isFullWidth={isFullWidth} onToggle={toggleWidth} />}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <div className={cn('min-h-0 flex-1 overflow-y-auto', pageBleed.all)}>
        <div className={cn(noteColumnClass(isFullWidth), 'pb-24')}>
          <p className="note-title mb-6 w-full p-0 text-foreground">{displayTitle(note.title, t)}</p>
          <CourseNoteBody note={note} endRef={endRef} onEditorReady={onEditorReady} />
        </div>
      </div>
    </div>
  );
}

interface CourseNoteBodyProps {
  note: NoteRead;
  endRef: SentinelRef;
  onEditorReady: () => void;
}

/** The read-only content of a course note and the marker at its end. The page and the course page share it. */
export function CourseNoteBody({ note, endRef, onEditorReady }: CourseNoteBodyProps) {
  return (
    <>
      <LazyRichNoteEditor editable={false} initialContent={note.content ?? ''} onReady={onEditorReady} />
      {/* End of the note: when it scrolls into view, the note counts as read. */}
      <div ref={endRef} aria-hidden data-testid="note-end-sentinel" className="h-px" />
    </>
  );
}
