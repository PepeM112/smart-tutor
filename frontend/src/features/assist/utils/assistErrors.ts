import { type ErrorCode, errorCase } from '@/lib/errorCode';

export type AssistRefusalKey = 'unavailable_in_course_test' | 'ai_not_configured' | 'ai_budget_used_up';

const REFUSAL_KEYS: Partial<Record<ErrorCode, AssistRefusalKey>> = {
  assist_blocked_by_course_test: 'unavailable_in_course_test',
  ai_not_configured: 'ai_not_configured',
  ai_budget_used_up: 'ai_budget_used_up',
};

/**
 * Gives the i18n key (in the `assist` namespace) for a refused assist request or a failed AI call, or
 * `null` when the error has no own text. `error` is the JSON body of a refused request or the data of a stream `error` event.
 */
export function assistRefusalKey(error: unknown): AssistRefusalKey | null {
  return errorCase(REFUSAL_KEYS, error) ?? null;
}
