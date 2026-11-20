import { describe, expect, it } from 'vitest';

import { QuestionType, type QuestionReadStripped, type TestQuestionGroupReadStripped } from '@/client';

import { buildExamEntries, isQuestionAnswered, pickActiveAnchor } from './examProgress';

const question = (questionType: QuestionType): QuestionReadStripped => ({
  id: 'q',
  questionType,
  prompt: 'p',
  content: {},
});

describe('isQuestionAnswered', () => {
  it('rejects an empty or blank text answer', () => {
    expect(isQuestionAnswered(question(QuestionType.SIMPLE), undefined)).toBe(false);
    expect(isQuestionAnswered(question(QuestionType.SIMPLE), '   ')).toBe(false);
    expect(isQuestionAnswered(question(QuestionType.SIMPLE), 'ir')).toBe(true);
  });

  it('accepts a multiple choice answer with a selected option, including the first one', () => {
    expect(isQuestionAnswered(question(QuestionType.MULTIPLE_CHOICE), '0')).toBe(true);
    expect(isQuestionAnswered(question(QuestionType.MULTIPLE_CHOICE), '')).toBe(false);
  });
});

describe('pickActiveAnchor', () => {
  const entries = [
    { anchorId: 'a', top: -400 },
    { anchorId: 'b', top: 40 },
    { anchorId: 'c', top: 600 },
  ];

  it('picks the last entry that passed the offset', () => {
    expect(pickActiveAnchor(entries, 96, false)).toBe('b');
  });

  it('picks the first entry before any has passed the offset', () => {
    expect(pickActiveAnchor([{ anchorId: 'a', top: 300 }], 96, false)).toBe('a');
  });

  it('picks the last entry at the bottom of the page', () => {
    expect(pickActiveAnchor(entries, 96, true)).toBe('c');
  });

  it('returns null with no entries', () => {
    expect(pickActiveAnchor([], 96, false)).toBeNull();
  });
});

describe('buildExamEntries points', () => {
  const group: TestQuestionGroupReadStripped = {
    id: 'g',
    testId: 't',
    points: 5,
    questions: [1, 2, 3].map(n => ({ ...question(QuestionType.SIMPLE), id: `q${n}`, points: 2 })),
  };

  it('gives a group its own points, not the sum of its questions', () => {
    const [entry] = buildExamEntries([{ kind: 'group', group, order: 0 }], {}, 'Group');
    expect(entry.points).toBe(5);
  });

  it('gives a standalone question its points, or 1 when unset', () => {
    const entries = buildExamEntries(
      [
        { kind: 'question', question: { ...question(QuestionType.SIMPLE), points: 3 }, order: 0 },
        { kind: 'question', question: question(QuestionType.SIMPLE), order: 1 },
      ],
      {},
      'Group'
    );
    expect(entries.map(entry => entry.points)).toEqual([3, 1]);
  });
});
