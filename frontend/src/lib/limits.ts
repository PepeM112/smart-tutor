/**
 * Max length of a name that the user types. Same numbers as the backend:
 * `FOLDER_NAME_MAX` (app/core/constants.py) and `NoteBase.title` (app/schemas/note.py).
 * A longer value would cause a 422.
 */
export const NAME_LIMITS = {
  folder: 100,
  note: 200,
} as const;

/**
 * Max length of a Stream post and of a comment. Same numbers as the backend:
 * `POST_BODY_MAX` and `COMMENT_BODY_MAX` (app/core/constants.py). A longer value would cause a 422.
 */
export const FEED_LIMITS = {
  post: 5000,
  comment: 2000,
} as const;
