/** `detail` of the 409 that the backend sends when a course test is open (`space_attempt_service.py`). */
const COURSE_TEST_OPEN_DETAIL = 'The assistant is not available during a course test';

/** The AI error texts of `services/llm.py` (`NO_KEY_MESSAGE` and the budget message). */
const NO_KEY_DETAIL = 'AI is not configured. Please add your API key in Settings.';
const CLASS_BUDGET_DETAIL =
  'The AI budget of this classroom is used up for this month. Add your own API key in Settings to continue.';

export type AssistRefusalKey = 'unavailable_in_course_test' | 'ai_not_configured' | 'ai_budget_used_up';

const REFUSAL_KEYS: Record<string, AssistRefusalKey> = {
  [COURSE_TEST_OPEN_DETAIL]: 'unavailable_in_course_test',
  [NO_KEY_DETAIL]: 'ai_not_configured',
  [CLASS_BUDGET_DETAIL]: 'ai_budget_used_up',
};

/**
 * Gives the i18n key (in the `assist` namespace) for a refused assist request or a failed AI call, or
 * `null` when the `detail` has no own text. The backend sends English text only, so the match uses the exact string.
 */
export function assistRefusalKey(detail: string | undefined): AssistRefusalKey | null {
  return detail !== undefined && Object.hasOwn(REFUSAL_KEYS, detail) ? REFUSAL_KEYS[detail] : null;
}
