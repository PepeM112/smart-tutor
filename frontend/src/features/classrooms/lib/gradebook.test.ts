import { describe, expect, it } from 'vitest';

import type { GradebookColumn, GradebookCourse, GradeCellStatus } from '@/client';

import {
  CELL_STATUS_STYLES,
  formatAttempts,
  formatBestScore,
  groupColumns,
  resultHrefFromGrades,
  safeClassroomBackHref,
  studentName,
} from './gradebook';

const column = (itemId: string, courseId: string | null): GradebookColumn => ({
  itemId,
  title: itemId,
  courseId,
  passThreshold: 0.5,
  maxAttempts: null,
  dueAt: null,
  hidden: false,
});
const course = (courseId: string): GradebookCourse => ({ courseId, title: courseId, hidden: false, totalItems: 1 });

describe('groupColumns', () => {
  it('puts the loose tests first, then one group per course in course order', () => {
    const groups = groupColumns({
      columns: [column('a', 'c1'), column('b', null), column('c', 'c2'), column('d', 'c1')],
      courses: [course('c1'), course('c2')],
    });
    expect(groups.map(g => g.course?.courseId ?? null)).toEqual([null, 'c1', 'c2']);
    expect(groups[1].columns.map(c => c.index)).toEqual([0, 3]);
    expect(groups[0].columns.map(c => c.column.itemId)).toEqual(['b']);
  });

  it('has no loose group when there are no loose tests', () => {
    const groups = groupColumns({ columns: [column('a', 'c1')], courses: [course('c1')] });
    expect(groups).toHaveLength(1);
  });

  it('keeps a course without tests (it has a % column)', () => {
    const groups = groupColumns({ columns: [], courses: [course('c1')] });
    expect(groups).toEqual([{ course: course('c1'), columns: [] }]);
  });
});

describe('cell text', () => {
  it('formats the best score', () => {
    expect(formatBestScore(84.6)).toBe('85%');
    expect(formatBestScore(0)).toBe('0%');
    expect(formatBestScore(null)).toBeNull();
  });

  it('formats the attempts with and without a limit', () => {
    expect(formatAttempts(0, 3)).toBeNull();
    expect(formatAttempts(2, 3)).toBe('2/3');
    expect(formatAttempts(2, null)).toBe('2');
  });

  it('has a style for every status', () => {
    const statuses = [1, 2, 3, 4, 5] as GradeCellStatus[];
    statuses.forEach(status => expect(CELL_STATUS_STYLES[status].labelKey).toBeTruthy());
  });

  it('names a student by display name, else username', () => {
    expect(studentName({ displayName: 'Ana Ruiz', username: 'ana' })).toBe('Ana Ruiz');
    expect(studentName({ displayName: ' ', username: 'ana' })).toBe('ana');
    expect(studentName({ displayName: null, username: 'ana' })).toBe('ana');
  });
});

describe('back link from the result page', () => {
  it('builds a result link with the Grades tab as the back link', () => {
    expect(resultHrefFromGrades('r1', '/classrooms/math-1')).toBe(
      `/history/r1?from=${encodeURIComponent('/classrooms/math-1?tab=grades')}`
    );
  });

  it('accepts only classroom paths', () => {
    expect(safeClassroomBackHref('/classrooms/math-1?tab=grades')).toBe('/classrooms/math-1?tab=grades');
    expect(safeClassroomBackHref('https://evil.test')).toBeNull();
    expect(safeClassroomBackHref('//evil.test')).toBeNull();
    expect(safeClassroomBackHref('/classrooms/\\evil')).toBeNull();
    expect(safeClassroomBackHref('/history')).toBeNull();
    expect(safeClassroomBackHref(null)).toBeNull();
  });
});
