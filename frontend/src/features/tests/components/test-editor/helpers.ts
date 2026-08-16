import { QuestionGroupType, QuestionType } from '@/client';

import type { LongTextQuestionData } from '../long-text-question-block';
import type { Choice, MultipleChoiceQuestionData } from '../multiple-choice-question-block';
import type { QuestionGroupData } from '../question-group-block';

export function newMultipleChoice(): MultipleChoiceQuestionData {
  return {
    key: crypto.randomUUID(),
    type: QuestionType.MULTIPLE_CHOICE,
    prompt: '',
    choices: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ] as Choice[],
    points: 1,
  };
}

export function newQuestionGroup(): QuestionGroupData {
  return {
    key: crypto.randomUUID(),
    type: 'group',
    groupType: QuestionGroupType.GENERIC,
    title: '',
    rows: [{ prompt: '', answers: [''] }],
    points: 1,
  };
}

export function newLongText(): LongTextQuestionData {
  return {
    key: crypto.randomUUID(),
    type: QuestionType.LONG_TEXT,
    prompt: '',
    // 2 = LongTextLength.MEDIUM (default tier for new questions)
    lengthLimit: 2,
    criteria: [{ point: '', weight: 0.1, category: '' }],
    points: 1,
  };
}
