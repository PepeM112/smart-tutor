import { type ErrorCode, errorCase } from '@/lib/errorCode';

const FEED_ERROR_KEYS: Partial<Record<ErrorCode, string>> = {
  feed_teacher_only_post: 'feed.error_teacher_only_post',
  feed_teacher_only_comment: 'feed.error_teacher_only_comment',
  feed_author_only_edit: 'feed.error_author_only_edit',
  space_archived: 'feed.error_archived',
  feed_post_not_found: 'feed.error_post_not_found',
  feed_comment_not_found: 'feed.error_comment_not_found',
};

/**
 * Gives the i18n key for a refused feed write. The backend text is English only, so the Stream shows its
 * own translated text per code. `null` when the code is not known (the caller shows a generic text).
 */
export function feedErrorKey(error: unknown): string | null {
  return errorCase(FEED_ERROR_KEYS, error) ?? null;
}
