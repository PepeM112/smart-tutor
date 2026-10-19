import type { FeedAuthor } from '@/client';

/** An item shows "edited" when it was changed after it was made (the backend sets both times in one transaction). */
export function isEdited(item: { createdAt: Date; updatedAt: Date }): boolean {
  return item.updatedAt.getTime() > item.createdAt.getTime();
}

/** The name shown for an author: the display name, or the username when none is set. */
export function authorName(author: Pick<FeedAuthor, 'displayName' | 'username'>): string {
  return author.displayName || author.username;
}
