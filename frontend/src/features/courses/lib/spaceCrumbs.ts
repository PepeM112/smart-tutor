import { SpaceKind, type SpaceDetail } from '@/client';
import { classroomHref, Routes } from '@/lib/routes';

export type SpaceCrumb = { label: string; href: string };

type CrumbSource = Pick<SpaceDetail, 'id' | 'title' | 'kind' | 'parentId' | 'parentTitle'> | undefined;

/** The list page a space belongs to: the classroom list for a classroom or a course of one, else the course list. */
export function courseListHref(course: CrumbSource): string {
  return course?.kind === SpaceKind.CLASSROOM || course?.parentId ? Routes.CLASSROOMS : Routes.COURSES;
}

/**
 * The crumbs above a space page. A standalone course: Courses. A course of a classroom:
 * Classrooms › the classroom (the link goes back to it). A classroom itself (a test placed straight
 * in it): Classrooms only. The caller adds the crumb of the space itself.
 */
export function courseCrumbs(course: CrumbSource, labels: { courses: string; classrooms: string }): SpaceCrumb[] {
  if (course?.kind === SpaceKind.CLASSROOM) return [{ label: labels.classrooms, href: Routes.CLASSROOMS }];
  if (!course?.parentId) return [{ label: labels.courses, href: Routes.COURSES }];
  return [
    { label: labels.classrooms, href: Routes.CLASSROOMS },
    {
      label: course.parentTitle ?? labels.classrooms,
      href: classroomHref({ id: course.parentId, title: course.parentTitle ?? '' }),
    },
  ];
}

/** Where Back goes from a space page: the classroom (itself, or the parent of a course), else the course list. */
export function courseBackHref(course: CrumbSource): string {
  if (course?.kind === SpaceKind.CLASSROOM) return classroomHref(course);
  return course?.parentId ? classroomHref({ id: course.parentId, title: course.parentTitle ?? '' }) : Routes.COURSES;
}
