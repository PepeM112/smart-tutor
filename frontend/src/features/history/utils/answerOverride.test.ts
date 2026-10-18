import { describe, expect, it } from 'vitest';

import { AnswerStatus, type AnswerRead } from '@/client';

import {
  computeAiScore,
  computeQuestionScore,
  countCorrectInGroup,
  effectiveStatus,
  isOverridden,
} from '../components/resultDetailUtils';

import { parseOverrideScore } from './answerOverride';

const answer = (patch: Partial<AnswerRead> = {}): AnswerRead => ({
  id: 'a1',
  questionId: 'q1',
  userAnswer: 'x',
  status: AnswerStatus.WRONG,
  ...patch,
});

describe('parseOverrideScore', () => {
  it('accepts a number inside 0..points', () => {
    expect(parseOverrideScore('0', 2)).toEqual({ ok: true, score: 0 });
    expect(parseOverrideScore(' 1.5 ', 2)).toEqual({ ok: true, score: 1.5 });
    expect(parseOverrideScore('2', 2)).toEqual({ ok: true, score: 2 });
  });

  it('accepts a comma as decimal separator', () => {
    expect(parseOverrideScore('0,5', 1)).toEqual({ ok: true, score: 0.5 });
  });

  it('refuses an empty or non-number text', () => {
    expect(parseOverrideScore('  ', 1)).toEqual({ ok: false, reason: 'empty' });
    expect(parseOverrideScore('abc', 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseOverrideScore('-1', 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseOverrideScore('1e3', 1000)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a score above the points', () => {
    expect(parseOverrideScore('2.01', 2)).toEqual({ ok: false, reason: 'out_of_range' });
  });
});

describe('override in the result view', () => {
  const question = { points: 2 } as Parameters<typeof computeQuestionScore>[1];

  it('uses the teacher score and status, and keeps the AI score', () => {
    const overridden = answer({ overrideScore: 1, overrideStatus: AnswerStatus.PARTIAL });
    expect(isOverridden(overridden)).toBe(true);
    expect(effectiveStatus(overridden)).toBe(AnswerStatus.PARTIAL);
    expect(computeQuestionScore(overridden, question)).toEqual({ label: '1.00/2.00', pct: 50 });
    expect(computeAiScore(overridden, question)).toEqual({ label: '0.00/2.00', pct: 0 });
  });

  it('scores a pending answer that a teacher graded', () => {
    const pending = answer({ status: AnswerStatus.PENDING, overrideScore: 2, overrideStatus: AnswerStatus.CORRECT });
    expect(computeQuestionScore(pending, question)).toEqual({ label: '2.00/2.00', pct: 100 });
  });

  it('falls back to the AI grade without override', () => {
    expect(isOverridden(answer())).toBe(false);
    expect(effectiveStatus(answer())).toBe(AnswerStatus.WRONG);
  });

  it('counts the teacher status in a group', () => {
    const map = new Map([['q1', answer({ overrideScore: 2, overrideStatus: AnswerStatus.CORRECT })]]);
    expect(countCorrectInGroup([{ id: 'q1' } as never], map)).toBe(1);
  });
});
