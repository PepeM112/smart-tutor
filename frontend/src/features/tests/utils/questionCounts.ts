import type { QuestionRead, TestRead } from '@/client';

export function getAllQuestions(test: TestRead): QuestionRead[] {
  const standalone = test.questions ?? [];
  const grouped = (test.questionGroups ?? []).flatMap(g => g.questions ?? []);
  return [...standalone, ...grouped];
}
