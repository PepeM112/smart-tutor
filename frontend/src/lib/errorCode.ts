import type { ErrorWithCode } from '@/client';

import { isRecord } from './typeGuards';

export type ErrorCode = ErrorWithCode['code'];

/**
 * Only `typeof string`: a newer backend can send a code that this build does not know, so the callers
 * look the code up in a table and treat a miss as "no own text".
 */
function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string';
}

/** The `code` of an API error body (an SDK error, an assist stream `error` event), or `undefined`. */
export function errorCode(error: unknown): ErrorCode | undefined {
  return isRecord(error) && isErrorCode(error.code) ? error.code : undefined;
}

/** The value of the table for the `code` of the error. Own keys only, so `constructor` is not a hit. */
export function errorCase<T>(table: Partial<Record<ErrorCode, T>>, error: unknown): T | undefined {
  const code = errorCode(error);
  return code !== undefined && Object.hasOwn(table, code) ? table[code] : undefined;
}

/** A number field of an error body (for example `maxPoints`). */
export function errorNumber(error: unknown, field: 'maxPoints'): number | undefined {
  const value = isRecord(error) ? error[field] : undefined;
  return typeof value === 'number' ? value : undefined;
}

/** A date field of an error body (for example `nextAttemptAt`). The JSON carries an ISO string. */
export function errorDate(error: unknown, field: 'nextAttemptAt'): Date | undefined {
  const value = isRecord(error) ? error[field] : undefined;
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
