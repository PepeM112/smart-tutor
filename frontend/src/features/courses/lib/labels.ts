import { Crown, Eye, Globe, Link2, Lock, PenLine, type LucideIcon } from 'lucide-react';

import { MemberStatus, SpaceRole, SpaceVisibility } from '@/client';

/** Translation keys per enum value. One place, so a new value fails the type check here. */
export const VISIBILITY_LABELS: Record<SpaceVisibility, string> = {
  [SpaceVisibility.PRIVATE]: 'courses.visibility_private',
  [SpaceVisibility.UNLISTED]: 'courses.visibility_unlisted',
  [SpaceVisibility.PUBLIC]: 'courses.visibility_public',
};

export const VISIBILITY_HINTS: Record<SpaceVisibility, string> = {
  [SpaceVisibility.PRIVATE]: 'courses.visibility_private_hint',
  [SpaceVisibility.UNLISTED]: 'courses.visibility_unlisted_hint',
  [SpaceVisibility.PUBLIC]: 'courses.visibility_public_hint',
};

export const VISIBILITY_ICONS: Record<SpaceVisibility, LucideIcon> = {
  [SpaceVisibility.PRIVATE]: Lock,
  [SpaceVisibility.UNLISTED]: Link2,
  [SpaceVisibility.PUBLIC]: Globe,
};

export const ROLE_ICONS: Record<SpaceRole, LucideIcon> = {
  [SpaceRole.OWNER]: Crown,
  [SpaceRole.EDITOR]: PenLine,
  [SpaceRole.VIEWER]: Eye,
};

export const ROLE_LABELS: Record<SpaceRole, string> = {
  [SpaceRole.OWNER]: 'courses.role_owner',
  [SpaceRole.EDITOR]: 'courses.role_editor',
  [SpaceRole.VIEWER]: 'courses.role_viewer',
};

/** In a classroom the roles are Owner, Co-teacher (EDITOR) and Student (VIEWER). */
export const CLASSROOM_ROLE_LABELS: Record<SpaceRole, string> = {
  [SpaceRole.OWNER]: 'classrooms.role_owner',
  [SpaceRole.EDITOR]: 'classrooms.role_co_teacher',
  [SpaceRole.VIEWER]: 'classrooms.role_student',
};

/** The translation key of a role in a course or in a classroom. */
export function roleLabelKey(role: SpaceRole, isClassroom: boolean): string {
  return (isClassroom ? CLASSROOM_ROLE_LABELS : ROLE_LABELS)[role];
}

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  [MemberStatus.INVITED]: 'courses.status_invited',
  [MemberStatus.REQUESTED]: 'courses.status_requested',
  [MemberStatus.ACTIVE]: 'courses.status_active',
};

export const VISIBILITY_OPTIONS = [SpaceVisibility.PRIVATE, SpaceVisibility.UNLISTED, SpaceVisibility.PUBLIC] as const;

export const ROLE_OPTIONS = [SpaceRole.OWNER, SpaceRole.EDITOR, SpaceRole.VIEWER] as const;

/** A classroom can not be public (the backend gives a 400). */
export const CLASSROOM_VISIBILITY: readonly SpaceVisibility[] = [SpaceVisibility.PRIVATE, SpaceVisibility.UNLISTED];
