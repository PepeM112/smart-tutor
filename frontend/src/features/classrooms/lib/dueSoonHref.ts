import { SpaceItemKind, type DueSoonItem } from '@/client';
import { classroomItemHref, courseAttemptHref, courseItemHref } from '@/lib/routes';

type DueSoonTarget = Pick<DueSoonItem, 'itemId' | 'kind' | 'spaceId' | 'spaceTitle' | 'classroomId'>;

/**
 * The page of a due item. A test opens its attempt page. A note opens in its space with the item marked: a
 * note of a course goes to the course page, a note placed straight in the classroom goes to the classroom
 * (Classwork tab). Used by the due-soon list and by the due-soon notification.
 */
export function dueSoonHref(item: DueSoonTarget): string {
  const space = { id: item.spaceId, title: item.spaceTitle };
  if (item.kind === SpaceItemKind.TEST) return courseAttemptHref(space, item.itemId);
  return item.spaceId === item.classroomId ? classroomItemHref(space, item.itemId) : courseItemHref(space, item.itemId);
}
