'use client';

import { useState } from 'react';

import { type SpaceDetail, type SpaceItemRead } from '@/client';

import { canTrackProgress, findNoteItem } from '../lib/progress';

import { useCourse } from './useCourse';
import { useCourseProgress, useVisitItem } from './useCourseProgress';
import { useEndSentinel, type SentinelRef } from './useEndSentinel';

type NoteReadProgress = {
  course: SpaceDetail | undefined;
  item: SpaceItemRead | undefined;
  /** Put it on an element at the end of the note. */
  endRef: SentinelRef;
  /** Call it when the editor has the content: before that, the end of the note is in view. */
  onEditorReady: () => void;
  /** Call it when the student takes the done mark away: the end of the note must not mark it again. */
  onUnmark: () => void;
};

/**
 * What a published course note does with the progress of a viewer: it sets "Continue" to this note,
 * and reaching the end of the note marks it done, once. The server call is idempotent.
 */
export function useNoteReadProgress(noteId: string, courseId: string): NoteReadProgress {
  // The same cache entry as the breadcrumb.
  const { data: course } = useCourse(courseId);
  const item = course ? findNoteItem(course.sections, noteId) : undefined;
  const isTracked = course !== undefined && canTrackProgress(course);
  const { markDone } = useCourseProgress(courseId);

  useVisitItem(courseId, item?.id, isTracked);
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

  return { course, item, endRef, onEditorReady: () => setIsEditorReady(true), onUnmark: () => setIsAutoMarkOff(true) };
}
