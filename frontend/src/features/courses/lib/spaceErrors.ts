import { type ErrorCode, errorCase } from '@/lib/errorCode';

const SPACE_ERROR_KEYS: Partial<Record<ErrorCode, string>> = {
  removed_course_has_results: 'classrooms.error_removed_course_has_results',
  space_archived: 'classrooms.error_space_archived',
};

/**
 * Gives the i18n key for a refused space write that has its own text.
 * `null` when the error has no own text (the caller shows the detail or a generic text).
 */
export function spaceErrorKey(error: unknown): string | null {
  return errorCase(SPACE_ERROR_KEYS, error) ?? null;
}
