'use client';

import { useTranslations } from 'next-intl';

import { type NoteRead } from '@/client';
import { FilePageShell } from '@/features/files/components/FilePageShell';
import { NoteWidthToggle } from '@/features/notes/components/NoteWidthToggle';
import { RichNoteEditor } from '@/features/notes/editor/RichNoteEditor';
import { noteColumnClass, useNoteColumn } from '@/features/notes/hooks/useNoteColumn';
import { displayTitle } from '@/lib/displayTitle';
import { pageBleed } from '@/lib/pageBleed';
import { cn } from '@/lib/utils';

import { CourseNoteBreadcrumb } from './CourseNoteBreadcrumb';

/**
 * A published course note. It is read-only for every member: authors change it through
 * the course edit mode (a draft twin), so members never see a half-done edit.
 */
export function CourseNoteView({ note, courseId }: { note: NoteRead; courseId: string }) {
  const t = useTranslations();
  const { isDesktop, isFullWidth, toggleWidth } = useNoteColumn();

  return (
    <FilePageShell
      breadcrumb={<CourseNoteBreadcrumb courseId={courseId} noteTitle={note.title} />}
      actions={isDesktop && <NoteWidthToggle isFullWidth={isFullWidth} onToggle={toggleWidth} />}
    >
      <div className={cn('min-h-0 flex-1 overflow-y-auto', pageBleed.all)}>
        <div className={cn(noteColumnClass(isFullWidth), 'pb-24')}>
          <h1 className="note-title mb-6 w-full p-0 text-foreground">{displayTitle(note.title, t)}</h1>
          <RichNoteEditor editable={false} initialContent={note.content ?? ''} />
        </div>
      </div>
    </FilePageShell>
  );
}
