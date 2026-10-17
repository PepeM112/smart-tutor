import { SpaceRole, type SpaceDetail } from '@/client';

export type CourseAccess = {
  /** Reads the published content and opens its items. */
  isMember: boolean;
  /** Sees the Content / Members / Settings tabs. */
  isAuthor: boolean;
};

/**
 * Use `myRole`, not `myStatus`: the backend sets `myRole` only for the owner or an ACTIVE member.
 * The owner has no member row, so `myStatus` is null for the owner.
 */
export function courseAccess(course: Pick<SpaceDetail, 'myRole'>): CourseAccess {
  const role = course.myRole;
  return {
    isMember: role !== null,
    isAuthor: role === SpaceRole.OWNER || role === SpaceRole.EDITOR,
  };
}
