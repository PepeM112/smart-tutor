import { SpaceKind } from '@/client';
import { classroomHref, courseHref } from '@/lib/routes';

/** The page of a space: a classroom or a course. A code or an invitation can lead to either. */
export function spaceHref(space: { id: string; title: string; kind: SpaceKind }): string {
  return space.kind === SpaceKind.CLASSROOM ? classroomHref(space) : courseHref(space);
}
