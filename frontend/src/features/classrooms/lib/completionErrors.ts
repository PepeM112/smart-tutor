import { type ErrorCode, errorCase } from '@/lib/errorCode';

/** The i18n key (under `classrooms.`) of each code that "Remove completion" can get from the backend. */
const COMPLETION_ERROR_KEYS: Partial<Record<ErrorCode, string>> = {
  completion_passed: 'completion_error_passed',
  space_archived: 'completion_error_archived',
  completion_not_found: 'completion_error_not_found',
};

/** The text key for a refused "Remove completion" request. `null` when the error has no own text. */
export function removeCompletionErrorKey(error: unknown): string | null {
  return errorCase(COMPLETION_ERROR_KEYS, error) ?? null;
}
