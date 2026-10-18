'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type NoteRead } from '@/client';
import { FilePageShell } from '@/features/files/components/FilePageShell';
import { NoteWidthToggle } from '@/features/notes/components/NoteWidthToggle';
import { RichNoteEditor } from '@/features/notes/editor/RichNoteEditor';
import { noteColumnClass, useNoteColumn } from '@/features/notes/hooks/useNoteColumn';
import { displayTitle } from '@/lib/displayTitle';
import { pageBleed } from '@/lib/pageBleed';
import { cn } from '@/lib/utils';

import { useCourse } from '../hooks/useCourse';
import { useCourseProgress, useVisitItem } from '../hooks/useCourseProgress';
import { useEndSentinel } from '../hooks/useEndSentinel';
import { canTrackProgress, findNoteItem } from '../lib/progress';

import { CopyToLibraryButton } from './CopyToLibraryButton';
import { CourseNoteBreadcrumb } from './CourseNoteBreadcrumb';
import { NoteDoneButton } from './CourseProgress';

/**
 * A published course note. It is read-only for every member: authors change it through
 * the course edit mode (a draft twin), so members never see a half-done edit.
 */
export function CourseNoteView({ note, courseId }: { note: NoteRead; courseId: string }) {
  const t = useTranslations();
  const { isDesktop, isFullWidth, toggleWidth } = useNoteColumn();
  // The same cache entry as the breadcrumb.
  const { data: course } = useCourse(courseId);
  const item = course ? findNoteItem(course.sections, note.id) : undefined;
  const isTracked = course !== undefined && canTrackProgress(course);
  const { markDone } = useCourseProgress(courseId);

  useVisitItem(courseId, item?.id, isTracked);
  // Reaching the end of the note marks it done, once. The server call is idempotent.
  // After a manual un-mark the end of the note must not mark it again.
  const [isAutoMarkOff, setIsAutoMarkOff] = useState(false);
  // The editor starts empty and gets the note a moment later. Until then the end marker sits at the top of
  // the page, in view, and would count as "reached" before the student has read or scrolled anything.
  const [isEditorReady, setIsEditorReady] = useState(false);
  const endRef = useEndSentinel(
    () => {
      setIsAutoMarkOff(true);
      if (item) markDone.mutate(item.id);
    },
    isTracked && isEditorReady && !isAutoMarkOff && item?.completed === false
  );

  return (
    <FilePageShell
      breadcrumb={<CourseNoteBreadcrumb courseId={courseId} noteTitle={note.title} />}
      actions={
        <>
          <CopyToLibraryButton noteId={note.id} />
          {course && item && <NoteDoneButton course={course} item={item} onUnmark={() => setIsAutoMarkOff(true)} />}
          {isDesktop && <NoteWidthToggle isFullWidth={isFullWidth} onToggle={toggleWidth} />}
        </>
      }
    >
      <div className={cn('min-h-0 flex-1 overflow-y-auto', pageBleed.all)}>
        <div className={cn(noteColumnClass(isFullWidth), 'pb-24')}>
          <h1 className="note-title mb-6 w-full p-0 text-foreground">{displayTitle(note.title, t)}</h1>
          <RichNoteEditor editable={false} initialContent={note.content ?? ''} onReady={() => setIsEditorReady(true)} />
          {/* End of the note: when it scrolls into view, the note counts as read. */}
          <div ref={endRef} aria-hidden data-testid="note-end-sentinel" className="h-px" />
        </div>
      </div>
    </FilePageShell>
  );
}
