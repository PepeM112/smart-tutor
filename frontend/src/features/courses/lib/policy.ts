/** The saved pass threshold is a fraction (0..1). The author types a percent. */
export function thresholdToPercent(threshold: number | null | undefined): number | null {
  return threshold === null || threshold === undefined ? null : Math.round(threshold * 100);
}

type ParsedNumber = { isValid: true; value: number | null } | { isValid: false };

/** An empty field = no limit (`null`). Else a whole number from 1 up to `max`. Anything else is not valid. */
export function parsePolicyNumber(raw: string, max = Number.MAX_SAFE_INTEGER): ParsedNumber {
  const text = raw.trim();
  if (text === '') return { isValid: true, value: null };
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= max ? { isValid: true, value } : { isValid: false };
}
