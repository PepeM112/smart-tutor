import { describe, expect, it } from 'vitest';

import { SpaceKind } from '@/client';

import { courseBackHref, courseCrumbs, courseListHref } from './spaceCrumbs';

const labels = { courses: 'Courses', classrooms: 'Classrooms' };
const base = { id: 'c1', title: 'Biology', parentId: null, parentTitle: null };

describe('spaceCrumbs', () => {
  it('a standalone course points to the course list', () => {
    const course = { ...base, kind: SpaceKind.COURSE };
    expect(courseListHref(course)).toBe('/courses');
    expect(courseCrumbs(course, labels)).toEqual([{ label: 'Courses', href: '/courses' }]);
    expect(courseBackHref(course)).toBe('/courses');
  });

  it('a course of a classroom points to the classroom', () => {
    const course = { ...base, kind: SpaceKind.COURSE, parentId: 'p1', parentTitle: 'Class' };
    expect(courseListHref(course)).toBe('/classrooms');
    expect(courseCrumbs(course, labels).map(c => c.href)).toEqual(['/classrooms', '/classrooms/class-p1']);
    expect(courseBackHref(course)).toBe('/classrooms/class-p1');
  });

  it('a classroom itself points to the classroom routes, never to /courses', () => {
    const classroom = { ...base, kind: SpaceKind.CLASSROOM };
    expect(courseListHref(classroom)).toBe('/classrooms');
    expect(courseCrumbs(classroom, labels)).toEqual([{ label: 'Classrooms', href: '/classrooms' }]);
    expect(courseBackHref(classroom)).toBe('/classrooms/biology-c1');
  });

  it('without a space, the course list is the default', () => {
    expect(courseListHref(undefined)).toBe('/courses');
    expect(courseBackHref(undefined)).toBe('/courses');
  });
});
