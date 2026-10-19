import { SpaceKind, type SpaceSummary } from '@/client';

export type InvitationGroups = { courses: SpaceSummary[]; classrooms: SpaceSummary[] };

/**
 * Split the open invitations by space kind. The server sends one list: a course invitation and a
 * classroom invitation use the same endpoint, and `kind` tells them apart. The order stays the same.
 */
export function splitInvitations(invitations: SpaceSummary[]): InvitationGroups {
  return {
    courses: invitations.filter(space => space.kind !== SpaceKind.CLASSROOM),
    classrooms: invitations.filter(space => space.kind === SpaceKind.CLASSROOM),
  };
}
