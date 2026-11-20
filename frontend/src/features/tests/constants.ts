import { LongTextLength, QuestionType } from '@/client';

export const LONG_TEXT_LENGTH_TIERS = [
  { value: LongTextLength.SHORT, labelKey: 'test_editor.short_chars' as const, limit: 500 },
  { value: LongTextLength.MEDIUM, labelKey: 'test_editor.medium_chars' as const, limit: 1800 },
  { value: LongTextLength.LONG, labelKey: 'test_editor.long_chars' as const, limit: 5000 },
] as const;

export const QUESTION_TYPE_LABEL_KEYS: Record<QuestionType, string> = {
  [QuestionType.SIMPLE]: 'questions.type_simple',
  [QuestionType.MULTIPLE_CHOICE]: 'questions.type_multiple_choice',
  [QuestionType.LONG_TEXT]: 'questions.type_long_text',
};
