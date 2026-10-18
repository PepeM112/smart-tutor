/** `detail` of the 409 that the backend sends when a course test is open (`space_attempt_service.py`). */
const COURSE_TEST_OPEN_DETAIL = 'The assistant is not available during a course test';

/**
 * Gives the i18n key (in the `assist` namespace) for a refused assist request, or `null` when the
 * `detail` has no own text. The backend sends English text only, so the match uses the exact string.
 */
export function assistRefusalKey(detail: string | undefined): 'unavailable_in_course_test' | null {
  return detail === COURSE_TEST_OPEN_DETAIL ? 'unavailable_in_course_test' : null;
}
