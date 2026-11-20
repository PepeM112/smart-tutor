'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { SpaceItemKind, type NoteRead, type SpaceDetail, type SpaceItemRead } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { displayTitle } from '@/lib/displayTitle';
import { Routes } from '@/lib/routes';

import { useNoteReadProgress } from '../hooks/useNoteReadProgress';
import { attemptPolicyLines } from '../lib/attemptLines';
import { outlineItemHref } from '../lib/itemAction';
import { isCourseViewer, nextItem } from '../lib/progress';

import { CourseNoteBody } from './CourseNoteView';
import { NoteDoneButton, TestAttemptButton } from './CourseProgress';

interface CourseItemViewProps {
  course: SpaceDetail;
  item: SpaceItemRead;
}

/**
 * The item that `?item=` selected, in the page column: a note to read or a test to start.
 * The page keys it by item, so reading one item never keeps the state of the one before.
 */
export function CourseItemView({ course, item }: CourseItemViewProps) {
  const topRef = useRef<HTMLDivElement>(null);

  // The column scroller keeps its position when the item changes: the next item must open at its top.
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <div ref={topRef} className="flex flex-col gap-6">
      {item.kind === SpaceItemKind.NOTE && item.noteId && (
        <CourseNoteItem course={course} item={item} noteId={item.noteId} />
      )}
      {item.kind === SpaceItemKind.TEST && <CourseTestItem course={course} item={item} />}
    </div>
  );
}

function CourseNoteItem({ course, item, noteId }: CourseItemViewProps & { noteId: string }) {
  const t = useTranslations();
  // The same key as the preview pane of the draft editor: one fetch for both.
  const {
    data: noteRes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: fileQueryKeys.note(noteId),
    queryFn: () => sdk.notesGet({ path: { note_id: noteId } }),
  });
  const note = noteRes?.data;

  return (
    <QueryState isLoading={isLoading} isError={isError} errorMessage={t('notes.failed_to_load_note')}>
      {note && <CourseNoteArticle course={course} item={item} note={note} />}
    </QueryState>
  );
}

function CourseNoteArticle({ course, item, note }: CourseItemViewProps & { note: NoteRead }) {
  const t = useTranslations();
  const { endRef, onEditorReady, onUnmark } = useNoteReadProgress(note.id, course.id);
  const next = nextItem(course.sections, item.id);
  const nextHref = next && outlineItemHref(course, next);

  return (
    <article className="flex flex-col gap-6 pb-16">
      <h2 className="font-serif text-3xl leading-tight font-medium text-foreground">{displayTitle(note.title, t)}</h2>
      <div>
        <CourseNoteBody note={note} endRef={endRef} onEditorReady={onEditorReady} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <NoteDoneButton course={course} item={item} onUnmark={onUnmark} />
        {next && nextHref && (
          <Button asChild variant="ghost" size="sm">
            <Link href={nextHref}>
              {t('courses.next_item', { title: next.title })}
              <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}

function CourseTestItem({ course, item }: CourseItemViewProps) {
  const t = useTranslations();
  const format = useFormatter();
  // One clock reading per mount, as in the start card.
  const [now] = useState(() => new Date());
  const lines = attemptPolicyLines(item, now, t, format);

  return (
    <article className="flex flex-col gap-4">
      <h2 className="font-serif text-3xl leading-tight font-medium text-foreground">{item.title}</h2>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {lines.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex">
        {isCourseViewer(course) ? (
          <TestAttemptButton course={course} item={item} size="default" />
        ) : (
          item.testId && (
            <Button asChild variant="outline">
              <Link href={Routes.TEST_DETAIL(item.testId)}>{t('common.open')}</Link>
            </Button>
          )
        )}
      </div>
    </article>
  );
}
