/** The result of reading the score that a teacher typed. */
export type OverrideScoreInput =
  { ok: true; score: number } | { ok: false; reason: 'empty' | 'invalid' | 'out_of_range' };

/**
 * Reads the score a teacher typed for one answer: a number from 0 up to the points of the question.
 * A comma is accepted as decimal separator (es keyboards). The API has the same limits.
 */
export function parseOverrideScore(input: string, maxPoints: number): OverrideScoreInput {
  const text = input.trim().replace(',', '.');
  if (text === '') return { ok: false, reason: 'empty' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, reason: 'invalid' };
  const score = Number(text);
  if (!Number.isFinite(score) || score > maxPoints) return { ok: false, reason: 'out_of_range' };
  return { ok: true, score };
}
