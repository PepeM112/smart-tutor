import { FileText, Layers, ListChecks } from 'lucide-react';

import { QuestionType } from '@/client';

import type { LucideIcon } from 'lucide-react';

type QuestionTypeInfo = {
  icon: LucideIcon;
  labelKey: string;
};

const QUESTION_TYPE_MAP: Record<number, QuestionTypeInfo> = {
  [QuestionType.SIMPLE]: { icon: Layers, labelKey: 'test_editor.simple' },
  [QuestionType.MULTIPLE_CHOICE]: { icon: ListChecks, labelKey: 'test_editor.multiple_choice' },
  [QuestionType.LONG_TEXT]: { icon: FileText, labelKey: 'test_editor.long_text' },
};

export function getQuestionTypeInfo(type: QuestionType): QuestionTypeInfo {
  return QUESTION_TYPE_MAP[type] ?? { icon: FileText, labelKey: 'test_editor.unknown' };
}
