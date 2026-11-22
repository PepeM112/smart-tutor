import { type ErrorCode, errorCase, errorCode, errorNumber } from '@/lib/errorCode';

/** An i18n key (under `history.`) and its values for a refused override, challenge or similar request. */
export type OverrideErrorText = { key: string; values?: Record<string, string> };

const OVERRIDE_ERROR_KEYS: Partial<Record<ErrorCode, string>> = {
  override_not_classroom: 'override_error_not_classroom',
  space_archived: 'override_error_archived',
  answer_overridden: 'override_error_challenge_refused',
};

/**
 * Gives the text key for a refused override or challenge request.
 * `null` when the error has no own text (the caller shows a generic error).
 */
export function overrideErrorText(error: unknown): OverrideErrorText | null {
  const points = errorNumber(error, 'maxPoints');
  if (errorCode(error) === 'override_score_out_of_range' && points !== undefined) {
    return { key: 'override_error_range', values: { points: String(points) } };
  }
  const key = errorCase(OVERRIDE_ERROR_KEYS, error);
  return key ? { key } : null;
}
