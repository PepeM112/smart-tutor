import { FileText, Layers, ListChecks } from 'lucide-react';

import { QuestionType } from '@/client';

import { QUESTION_TYPE_LABEL_KEYS } from '../constants';

import type { LucideIcon } from 'lucide-react';

type QuestionTypeInfo = {
  icon: LucideIcon;
  labelKey: string;
};

const QUESTION_TYPE_ICONS: Record<number, LucideIcon> = {
  [QuestionType.SIMPLE]: Layers,
  [QuestionType.MULTIPLE_CHOICE]: ListChecks,
  [QuestionType.LONG_TEXT]: FileText,
};

export function getQuestionTypeInfo(type: QuestionType): QuestionTypeInfo {
  const icon = QUESTION_TYPE_ICONS[type];
  if (!icon) return { icon: FileText, labelKey: 'test_editor.unknown' };
  return { icon, labelKey: QUESTION_TYPE_LABEL_KEYS[type] };
}
