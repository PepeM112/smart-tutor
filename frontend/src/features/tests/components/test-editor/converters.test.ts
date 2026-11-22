import { describe, expect, it } from 'vitest';

import {
  QuestionGroupType,
  QuestionType,
  type GeneratedQuestionPreviewOutput,
  type QuestionRead,
  type TestQuestionGroupRead,
} from '@/client';

import {
  fromApiToEditorItems,
  groupToApiGroup,
  longTextToApiQuestion,
  mcToApiQuestion,
  mergeAiEditResult,
} from './converters';

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
  originId: 'source-q1',
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
  questions: [
    {
      ...simpleRead,
      id: 'q4',
      tags: ['grouped'],
      hint: 'Grouped hint',
      explanation: 'Grouped explanation',
      originId: 'source-q4',
    },
  ],
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

describe('test editor converters keep the origin of a copied question', () => {
  const items = fromApiToEditorItems([mcRead, longRead, simpleRead], [groupRead]);

  it('keeps originId of a multiple choice question', () => {
    expect(mcToApiQuestion(items[0] as MultipleChoiceQuestionData, 0).originId).toBe('source-q1');
  });

  it('keeps originId of a long text question', () => {
    expect(longTextToApiQuestion(items[1] as LongTextQuestionData, 1).originId).toBe('source-q1');
  });

  it('keeps originId of a standalone simple question', () => {
    expect(groupToApiGroup(items[2] as QuestionGroupData, 2).questions?.[0].originId).toBe('source-q1');
  });

  it('keeps originId of a grouped question', () => {
    expect(groupToApiGroup(items[3] as QuestionGroupData, 3).questions?.[0].originId).toBe('source-q4');
  });
});

describe('test editor converters refuse bad content', () => {
  it('throws for a multiple choice question without options', () => {
    const broken = { ...mcRead, content: {} } as unknown as QuestionRead;

    expect(() => fromApiToEditorItems([broken], [])).toThrow('q1');
  });

  it('throws for a long text question without a rubric', () => {
    const broken = { ...longRead, content: {} } as unknown as QuestionRead;

    expect(() => fromApiToEditorItems([broken], [])).toThrow('q2');
  });
});

describe('mergeAiEditResult keeps tags, hint and explanation', () => {
  const items = fromApiToEditorItems([mcRead, longRead, simpleRead], [groupRead]);
  // Flat order: MC, long text, standalone simple row, grouped simple row.
  const aiQuestions = [
    {
      questionType: QuestionType.MULTIPLE_CHOICE,
      prompt: 'AI MC',
      content: { options: ['x', 'y'], correctIndices: [1] },
    },
    { questionType: QuestionType.LONG_TEXT, prompt: 'AI long', content: { lengthLimit: 2, rubric: [] } },
    { questionType: QuestionType.SIMPLE, prompt: 'AI simple', content: { answers: ['a'] } },
    { questionType: QuestionType.SIMPLE, prompt: 'AI grouped', content: { answers: ['b'] } },
  ] as unknown as GeneratedQuestionPreviewOutput[];
  const merged = mergeAiEditResult(items, aiQuestions, [0, 3]);

  it('keeps them on a multiple choice block', () => {
    const payload = mcToApiQuestion(merged[0] as MultipleChoiceQuestionData, 0);
    expect(payload.prompt).toBe('AI MC');
    expect([payload.tags, payload.hint, payload.explanation]).toEqual([['verbs', 'a1'], 'A hint', 'An explanation']);
  });

  it('keeps them on a grouped row', () => {
    const question = groupToApiGroup(merged[3] as QuestionGroupData, 3).questions?.[0];
    expect(question?.prompt).toBe('AI grouped');
    expect([question?.tags, question?.hint, question?.explanation]).toEqual([
      ['grouped'],
      'Grouped hint',
      'Grouped explanation',
    ]);
  });
});
