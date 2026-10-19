/** The `detail` texts of a refused feed write (`space_feed_service.py`, `space_service.py`), and their i18n keys. */
const FEED_ERROR_KEYS = new Map<string, string>([
  ['Only the teacher can post in this classroom', 'feed.error_teacher_only_post'],
  ['Only the teacher can comment in this classroom', 'feed.error_teacher_only_comment'],
  ['Only the author can edit this post', 'feed.error_author_only_edit'],
  ['Only the author can edit this comment', 'feed.error_author_only_edit'],
  ['The classroom is archived', 'feed.error_archived'],
]);

/**
 * Gives the i18n key for a `detail` of a refused feed write. The backend sends English text only, so the
 * Stream matches these exact strings and shows its own translated text. `null` when the detail is not
 * known (the caller shows a generic text): a changed backend text then falls back, it never breaks.
 */
export function feedErrorKey(detail: string | undefined): string | null {
  return (detail && FEED_ERROR_KEYS.get(detail)) || null;
}
