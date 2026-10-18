import type { SpaceDetail } from '@/client';
import { classroomHref, Routes } from '@/lib/routes';

export type SpaceCrumb = { label: string; href: string };

type CrumbSource = Pick<SpaceDetail, 'parentId' | 'parentTitle'> | undefined;

/** The list page a course belongs to: the classroom list for a course of a classroom, else the course list. */
export function courseListHref(course: CrumbSource): string {
  return course?.parentId ? Routes.CLASSROOMS : Routes.COURSES;
}

/**
 * The crumbs above a course page. A standalone course: Courses. A course of a classroom:
 * Classrooms › the classroom (the link goes back to it).
 */
export function courseCrumbs(course: CrumbSource, labels: { courses: string; classrooms: string }): SpaceCrumb[] {
  if (!course?.parentId) return [{ label: labels.courses, href: Routes.COURSES }];
  return [
    { label: labels.classrooms, href: Routes.CLASSROOMS },
    {
      label: course.parentTitle ?? labels.classrooms,
      href: classroomHref({ id: course.parentId, title: course.parentTitle ?? '' }),
    },
  ];
}

/** Where Back goes from a course page: the classroom for a course of a classroom, else the course list. */
export function courseBackHref(course: CrumbSource): string {
  return course?.parentId ? classroomHref({ id: course.parentId, title: course.parentTitle ?? '' }) : Routes.COURSES;
}
