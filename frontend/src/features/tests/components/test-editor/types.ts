import type { LongTextQuestionData } from '../LongTextQuestionBlock';
import type { MultipleChoiceQuestionData } from '../MultipleChoiceQuestionBlock';
import type { QuestionGroupData } from '../QuestionGroupBlock';

export type EditorItem = MultipleChoiceQuestionData | QuestionGroupData | LongTextQuestionData;
