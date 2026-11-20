import { describe, expect, it } from 'vitest';

import { AnswerStatus, QuestionType, type AnswerRead, type TestQuestionGroupReadStripped } from '@/client';

import { ExamItemType } from '../components/resultDetailUtils';

import { aggregateStatus, buildResultEntries, summarizeEntries, type ResultEntry } from './resultEntries';

function entry(status: AnswerStatus): ResultEntry {
  return { id: String(status), number: 1, title: 'Q', status, earnedPoints: 0, maxPoints: 1, isGroup: false };
}

describe('aggregateStatus', () => {
  it.each([
    [[AnswerStatus.CORRECT, AnswerStatus.CORRECT], AnswerStatus.CORRECT],
    [[AnswerStatus.WRONG, AnswerStatus.FAILED], AnswerStatus.WRONG],
    [[AnswerStatus.CORRECT, AnswerStatus.WRONG], AnswerStatus.PARTIAL],
    [[AnswerStatus.CORRECT, AnswerStatus.PENDING], AnswerStatus.PENDING],
  ])('%j gives %s', (statuses, expected) => {
    expect(aggregateStatus(statuses)).toBe(expected);
  });
});

describe('summarizeEntries', () => {
  it('counts each mark, folds failed into wrong and leaves out empty counts', () => {
    const entries = [
      entry(AnswerStatus.CORRECT),
      entry(AnswerStatus.CORRECT),
      entry(AnswerStatus.WRONG),
      entry(AnswerStatus.FAILED),
    ];
    expect(summarizeEntries(entries)).toEqual([
      { status: AnswerStatus.CORRECT, count: 2 },
      { status: AnswerStatus.WRONG, count: 2 },
    ]);
  });
});

describe('buildResultEntries group points', () => {
  const group: TestQuestionGroupReadStripped = {
    id: 'g',
    testId: 't',
    points: 5,
    questions: ['q1', 'q2', 'q3'].map(id => ({ id, questionType: QuestionType.SIMPLE, prompt: id, content: {} })),
  };
  const answerMap = (statuses: AnswerStatus[]): Map<string, AnswerRead> =>
    new Map(
      statuses.map((status, index) => [
        `q${index + 1}`,
        { id: `a${index}`, questionId: `q${index + 1}`, userAnswer: '', status },
      ])
    );
  const build = (statuses: AnswerStatus[]): ResultEntry =>
    buildResultEntries([{ type: ExamItemType.GROUP, group, order: 0 }], answerMap(statuses), 'Group')[0];

  it('uses the group points as the max, not the sum of its questions', () => {
    expect(build([AnswerStatus.CORRECT, AnswerStatus.CORRECT, AnswerStatus.CORRECT]).maxPoints).toBe(5);
  });

  it('scores 2 correct and 1 partial as 5 * 2.5 / 3, like the server', () => {
    const entry = build([AnswerStatus.CORRECT, AnswerStatus.CORRECT, AnswerStatus.PARTIAL]);
    expect(entry.earnedPoints).toBeCloseTo((5 * 2.5) / 3);
  });

  it('has no earned points while one answer is pending', () => {
    expect(build([AnswerStatus.CORRECT, AnswerStatus.PENDING, AnswerStatus.WRONG]).earnedPoints).toBeNull();
  });
});
