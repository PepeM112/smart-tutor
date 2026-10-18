import {
  SpaceItemKind,
  SpaceRole,
  SpaceStatus,
  type SpaceDetail,
  type SpaceItemRead,
  type SpaceSectionRead,
} from '@/client';

import { isHiddenByVisibleFrom } from './schedule';

/** What the Start / Resume button of a test row does. */
export type AttemptAction = 'resume' | 'start' | 'no_attempts_left' | 'cooldown';

/** A viewer tracks progress. The owner and the editors preview the course: no completion, no attempt rows. */
export function isCourseViewer(course: Pick<SpaceDetail, 'myRole'>): boolean {
  return course.myRole === SpaceRole.VIEWER;
}

/** A viewer can mark notes and start attempts only while the course is not archived (the backend gives 409). */
export function canTrackProgress(course: Pick<SpaceDetail, 'myRole' | 'status'>): boolean {
  return isCourseViewer(course) && course.status !== SpaceStatus.ARCHIVED;
}

export function flattenItems(sections: SpaceSectionRead[]): SpaceItemRead[] {
  return sections.flatMap(section => section.items);
}

/**
 * The item that "Continue" opens: the item the student opened last (`progress.lastItemId`), if it can go on.
 * A NOTE can always go on. A TEST can go on only with an open attempt (resume): the student must not start
 * a new attempt by accident, and a done test, or one with no attempt left, would send the student back.
 * Else the first item that is not done. Items hidden by `visibleFrom` are skipped.
 * No item = the course is empty or done.
 */
export function continueItem(
  sections: SpaceSectionRead[],
  lastItemId?: string | null,
  now: Date = new Date()
): SpaceItemRead | null {
  // An item that is not visible yet (`visibleFrom`) can not be opened by the student.
  const items = flattenItems(sections).filter(item => !isHiddenByVisibleFrom(item, now));
  const last = items.find(item => item.id === lastItemId);
  if (last && canContinueAt(last)) return last;
  return items.find(item => !item.completed) ?? null;
}

function canContinueAt(item: SpaceItemRead): boolean {
  return item.kind !== SpaceItemKind.TEST || Boolean(item.openAttemptId);
}

/** One item of the outline by id. */
export function findItem(sections: SpaceSectionRead[], itemId: string): SpaceItemRead | undefined {
  return flattenItems(sections).find(item => item.id === itemId);
}

/** The NOTE item that shows a note, if any. */
export function findNoteItem(sections: SpaceSectionRead[], noteId: string): SpaceItemRead | undefined {
  return flattenItems(sections).find(item => item.kind === SpaceItemKind.NOTE && item.noteId === noteId);
}

/** An open attempt always resumes. A new attempt needs an attempt left and no running cooldown. */
export function attemptAction(
  item: Pick<SpaceItemRead, 'openAttemptId' | 'attemptsLeft' | 'nextAttemptAt'>,
  now: Date
): AttemptAction {
  if (item.openAttemptId) return 'resume';
  if (item.attemptsLeft === 0) return 'no_attempts_left';
  if (item.nextAttemptAt && item.nextAttemptAt.getTime() > now.getTime()) return 'cooldown';
  return 'start';
}
