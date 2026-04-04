import { QuestionGroupType, QuestionType } from '@/client';

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
  };
}

export function newQuestionGroup(): QuestionGroupData {
  return {
    type: 'group',
    groupType: QuestionGroupType.UNKNOWN,
    title: '',
    rows: [{ prompt: '', answers: '' }],
  };
}
