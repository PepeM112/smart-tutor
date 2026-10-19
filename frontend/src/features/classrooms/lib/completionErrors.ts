/** The `detail` texts that "Remove completion" can get from the backend (English only), and the i18n key of each (under `classrooms.`). */
const DETAIL_KEYS: Record<string, string> = {
  'The best score of the student reaches the pass threshold': 'completion_error_passed',
  'The classroom is archived': 'completion_error_archived',
  'Completion not found': 'completion_error_not_found',
};

/** The text key for a refused "Remove completion" request. `null` when the detail has no own text. */
export function removeCompletionErrorKey(detail: string | undefined): string | null {
  return detail === undefined ? null : (DETAIL_KEYS[detail] ?? null);
}
