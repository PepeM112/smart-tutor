import { SpaceItemKind, type SpaceDetail, type SpaceItemRead } from '@/client';
import { courseHref, courseItemHref, noteHref, Routes } from '@/lib/routes';

/** A row opens a page (`href`) or runs `onClick` (for example the note preview). */
export type ItemRowAction = { href: string } | { onClick: () => void };

type OpenNote = ((noteId: string) => void) | undefined;

/**
 * A note opens the preview (the preview has a link to the full page). A test links to its page.
 * A viewer takes a test through the Start / Resume button, so a viewer's test row has no link.
 */
export function itemAction(item: SpaceItemRead, onOpenNote: OpenNote, isViewer: boolean): ItemRowAction | undefined {
  const { noteId } = item;
  if (item.kind === SpaceItemKind.NOTE && noteId && onOpenNote) return { onClick: () => onOpenNote(noteId) };
  if (item.kind === SpaceItemKind.TEST && isViewer) return undefined;
  if (item.kind === SpaceItemKind.COURSE && item.childSpaceId) {
    return { href: courseHref({ id: item.childSpaceId, title: item.title }) };
  }
  const href = itemHref(item);
  return href ? { href } : undefined;
}

/** Where an outline row of a course page goes: a note or a test opens in the page (`?item=`), a course item opens its own page. */
export function outlineItemHref(course: Pick<SpaceDetail, 'id' | 'title'>, item: SpaceItemRead): string | undefined {
  if (item.kind !== SpaceItemKind.COURSE) return courseItemHref(course, item.id);
  return item.childSpaceId ? courseHref({ id: item.childSpaceId, title: item.title }) : undefined;
}

/** The link to the content of a published item: the note page, or the exam of a test. */
function itemHref(item: SpaceItemRead): string | null {
  if (item.kind === SpaceItemKind.NOTE && item.noteId) return noteHref({ id: item.noteId, title: item.title });
  if (item.kind === SpaceItemKind.TEST && item.testId) return Routes.TEST_DETAIL(item.testId);
  return null;
}
