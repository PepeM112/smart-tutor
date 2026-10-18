const REMOVED_COURSE_HAS_RESULTS = 'A removed course has student results. Delete the course forever first.';

/**
 * Gives the i18n key for a `detail` of a refused space write that the backend sends in English only.
 * `null` when the detail has no own text (the caller shows the detail or a generic text).
 */
export function spaceErrorKey(detail: string | undefined): string | null {
  return detail === REMOVED_COURSE_HAS_RESULTS ? 'classrooms.error_removed_course_has_results' : null;
}
