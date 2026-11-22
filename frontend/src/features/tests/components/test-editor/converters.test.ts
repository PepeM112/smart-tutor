import { describe, expect, it } from 'vitest';

import { QuestionGroupType, QuestionType, type QuestionRead, type TestQuestionGroupRead } from '@/client';

import { fromApiToEditorItems, groupToApiGroup, longTextToApiQuestion, mcToApiQuestion } from './converters';

import type { LongTextQuestionData } from '../LongTextQuestionBlock';
import type { MultipleChoiceQuestionData } from '../MultipleChoiceQuestionBlock';
import type { QuestionGroupData } from '../QuestionGroupBlock';

const baseQuestion = {
  id: 'q1',
  prompt: 'Prompt',
  order: 0,
  points: 1,
  tags: ['verbs', 'a1'],
  hint: 'A hint',
  explanation: 'An explanation',
} as const;

const mcRead = {
  ...baseQuestion,
  questionType: QuestionType.MULTIPLE_CHOICE,
  content: { options: ['a', 'b'], correctIndices: [0] },
} as unknown as QuestionRead;

const longRead = {
  ...baseQuestion,
  id: 'q2',
  order: 1,
  questionType: QuestionType.LONG_TEXT,
  content: { lengthLimit: 2, rubric: [{ point: 'p', weight: 1 }] },
} as unknown as QuestionRead;

const simpleRead = {
  ...baseQuestion,
  id: 'q3',
  order: 2,
  questionType: QuestionType.SIMPLE,
  content: { answers: ['ir'] },
} as unknown as QuestionRead;

const groupRead = {
  id: 'g1',
  testId: 't1',
  type: QuestionGroupType.GENERIC,
  order: 3,
  title: 'Group',
  points: 1,
  questions: [{ ...simpleRead, id: 'q4', tags: ['grouped'], hint: 'Grouped hint', explanation: 'Grouped explanation' }],
} as unknown as TestQuestionGroupRead;

describe('test editor converters keep question tags, hint and explanation', () => {
  const items = fromApiToEditorItems([mcRead, longRead, simpleRead], [groupRead]);

  it('keeps tags of a multiple choice question', () => {
    expect(mcToApiQuestion(items[0] as MultipleChoiceQuestionData, 0).tags).toEqual(['verbs', 'a1']);
  });

  it('keeps tags of a long text question', () => {
    expect(longTextToApiQuestion(items[1] as LongTextQuestionData, 1).tags).toEqual(['verbs', 'a1']);
  });

  it('keeps tags of a standalone simple question', () => {
    const payload = groupToApiGroup(items[2] as QuestionGroupData, 2);
    expect(payload.questions?.[0].tags).toEqual(['verbs', 'a1']);
  });

  it('keeps tags of a grouped question', () => {
    const payload = groupToApiGroup(items[3] as QuestionGroupData, 3);
    expect(payload.questions?.[0].tags).toEqual(['grouped']);
  });

  it('keeps hint and explanation of a multiple choice question', () => {
    const payload = mcToApiQuestion(items[0] as MultipleChoiceQuestionData, 0);
    expect([payload.hint, payload.explanation]).toEqual(['A hint', 'An explanation']);
  });

  it('keeps hint and explanation of a long text question', () => {
    const payload = longTextToApiQuestion(items[1] as LongTextQuestionData, 1);
    expect([payload.hint, payload.explanation]).toEqual(['A hint', 'An explanation']);
  });

  it('keeps hint and explanation of a standalone simple question', () => {
    const question = groupToApiGroup(items[2] as QuestionGroupData, 2).questions?.[0];
    expect([question?.hint, question?.explanation]).toEqual(['A hint', 'An explanation']);
  });

  it('keeps hint and explanation of a grouped question', () => {
    const question = groupToApiGroup(items[3] as QuestionGroupData, 3).questions?.[0];
    expect([question?.hint, question?.explanation]).toEqual(['Grouped hint', 'Grouped explanation']);
  });
});
