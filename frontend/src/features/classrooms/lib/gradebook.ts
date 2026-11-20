import { Check, CircleDashed, Clock, Contrast, X, type LucideIcon } from 'lucide-react';

import {
  GradeCellStatus,
  type GradebookColumn,
  type GradebookCourse,
  type GradebookCourseProgress,
  type GradebookRead,
} from '@/client';
import { Routes } from '@/lib/routes';

/** One block of columns in the matrix: the loose tests of the classroom, or the tests of one course. */
export type GradebookGroup = {
  /** `null` for the loose tests of the classroom. */
  course: GradebookCourse | null;
  /** The index of each column in `gradebook.columns` (the same index as in `row.cells`). */
  columns: { column: GradebookColumn; index: number }[];
};

/**
 * Splits the columns into groups: the loose classroom tests first, then one group per course
 * (in course order). A course without tests still gets a group, because it has a % column.
 */
export function groupColumns(gradebook: Pick<GradebookRead, 'columns' | 'courses'>): GradebookGroup[] {
  const indexed = gradebook.columns.map((column, index) => ({ column, index }));
  const loose = indexed.filter(({ column }) => column.courseId === null);
  const courseGroups: GradebookGroup[] = gradebook.courses.map(course => ({
    course,
    columns: indexed.filter(({ column }) => column.courseId === course.courseId),
  }));
  return loose.length > 0 ? [{ course: null, columns: loose }, ...courseGroups] : courseGroups;
}

/** The progress of a student in one course (the course order of the row matches `gradebook.courses`). */
export function findCourseProgress(
  courses: GradebookCourseProgress[],
  courseId: string
): GradebookCourseProgress | undefined {
  return courses.find(progress => progress.courseId === courseId);
}

/** "85%" for a best score (the API gives 0..100). `null` when the student has no score. */
export function formatBestScore(bestScore: number | null): string | null {
  return bestScore === null ? null : `${Math.round(bestScore)}%`;
}

/** The text of the attempts: "2/3" with a limit, "2" without. `null` when there is no attempt. */
export function formatAttempts(attemptsUsed: number, maxAttempts: number | null): string | null {
  if (attemptsUsed === 0) return null;
  return maxAttempts === null ? `${attemptsUsed}` : `${attemptsUsed}/${maxAttempts}`;
}

/** i18n key (under `classrooms.`), semantic text color and mark of a cell status. The mark and the word never rest on color alone. */
export const CELL_STATUS_STYLES: Record<GradeCellStatus, { labelKey: string; textClass: string; icon: LucideIcon }> = {
  [GradeCellStatus.NOT_STARTED]: {
    labelKey: 'grade_status_not_started',
    textClass: 'text-muted-foreground',
    icon: CircleDashed,
  },
  [GradeCellStatus.IN_PROGRESS]: {
    labelKey: 'grade_status_in_progress',
    textClass: 'text-muted-foreground',
    icon: Contrast,
  },
  [GradeCellStatus.PENDING]: {
    labelKey: 'grade_status_pending',
    textClass: 'text-feedback-partial',
    icon: Clock,
  },
  [GradeCellStatus.PASSED]: {
    labelKey: 'grade_status_passed',
    textClass: 'text-feedback-correct',
    icon: Check,
  },
  [GradeCellStatus.FAILED]: {
    labelKey: 'grade_status_failed',
    textClass: 'text-destructive',
    icon: X,
  },
};

/** The name of a student row: the display name, else the username. */
export function studentName(row: { displayName: string | null; username: string }): string {
  return row.displayName?.trim() || row.username;
}

/**
 * The result page of a cell, with a back link to the Grades tab of the classroom.
 * `from` is read again by the result page, which accepts only classroom paths.
 */
export function resultHrefFromGrades(resultId: string, classroomHref: string): string {
  return `${Routes.RESULT_DETAIL(resultId)}?from=${encodeURIComponent(`${classroomHref}?tab=grades`)}`;
}

/** A back link is safe only when it is a path inside a classroom (no other site, no other page). */
export function safeClassroomBackHref(from: string | null): string | null {
  return from !== null && /^\/classrooms\/[^/\\]/.test(from) ? from : null;
}
