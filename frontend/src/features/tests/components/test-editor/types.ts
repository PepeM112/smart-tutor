import type { LongTextQuestionData } from '../long-text-question-block';
import type { MultipleChoiceQuestionData } from '../multiple-choice-question-block';
import type { QuestionGroupData } from '../question-group-block';

export type EditorItem = MultipleChoiceQuestionData | QuestionGroupData | LongTextQuestionData;
