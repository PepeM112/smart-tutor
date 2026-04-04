import { QuestionType } from '@/client';

import type { Choice, MultipleChoiceQuestionData } from '../multiple-choice-question-block';

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
