/**
 * Max length of a name that the user types. Same numbers as the backend:
 * `FOLDER_NAME_MAX` (app/core/constants.py) and `NoteBase.title` (app/schemas/note.py).
 * A longer value would cause a 422.
 */
export const NAME_LIMITS = {
  folder: 100,
  note: 200,
} as const;
