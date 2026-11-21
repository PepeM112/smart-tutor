import { SpaceRole } from '@/client';

/**
 * What the UI shows per space role. The backend enforces the same rules (`access_service.py`);
 * this map only decides which controls to show.
 */
export type SpaceAction =
  /** Reads the published content and opens its items. */
  | 'viewContent'
  /** Sees the author views: Content edit mode, Members, Grades. */
  | 'editContent'
  /** Tracks progress and starts attempts. The owner and the editors preview the course instead. */
  | 'trackProgress';

const SPACE_PERMISSIONS: Record<SpaceAction, readonly SpaceRole[]> = {
  viewContent: [SpaceRole.OWNER, SpaceRole.EDITOR, SpaceRole.VIEWER],
  editContent: [SpaceRole.OWNER, SpaceRole.EDITOR],
  trackProgress: [SpaceRole.VIEWER],
};

/** `role` is `null` for a user who is not an active member. */
export function canDo(role: SpaceRole | null | undefined, action: SpaceAction): boolean {
  return role != null && SPACE_PERMISSIONS[action].includes(role);
}
