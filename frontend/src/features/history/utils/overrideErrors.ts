/** An i18n key (under `history.`) and its values for a refused override, challenge or similar request. */
export type OverrideErrorText = { key: string; values?: Record<string, string> };

const NOT_CLASSROOM = 'Grade overrides are only available in classrooms';
const ARCHIVED = 'The classroom is archived';
const RANGE_RE = /^The score must be between 0 and (.+)$/;
const CHALLENGE_REFUSED = 'A teacher graded this answer. It cannot be challenged.';

/**
 * Gives the text key for a `detail` that the backend sends in English only.
 * `null` when the detail has no own text (the caller shows a generic error).
 */
export function overrideErrorText(detail: string | undefined): OverrideErrorText | null {
  if (detail === undefined) return null;
  if (detail === NOT_CLASSROOM) return { key: 'override_error_not_classroom' };
  if (detail === ARCHIVED) return { key: 'override_error_archived' };
  if (detail === CHALLENGE_REFUSED) return { key: 'override_error_challenge_refused' };
  const range = RANGE_RE.exec(detail);
  return range ? { key: 'override_error_range', values: { points: range[1] } } : null;
}
