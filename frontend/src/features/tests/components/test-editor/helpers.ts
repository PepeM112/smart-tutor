import { QuestionGroupType, QuestionType } from '@/client';

import type { LongTextQuestionData } from '../long-text-question-block';
import type { Choice, MultipleChoiceQuestionData } from '../multiple-choice-question-block';
import type { QuestionGroupData } from '../question-group-block';

export function newMultipleChoice(): MultipleChoiceQuestionData {
  return {
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
    type: 'group',
    groupType: QuestionGroupType.UNKNOWN,
    title: '',
    rows: [{ prompt: '', answers: [''] }],
    points: 1,
  };
}

export function newLongText(): LongTextQuestionData {
  return {
    type: QuestionType.LONG_TEXT,
    prompt: '',
    lengthLimit: 2,
    criteria: [{ point: '', weight: 0.1, category: '' }],
    points: 1,
  };
}
