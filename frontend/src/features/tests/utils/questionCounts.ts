import type { TestRead, TestReadStripped } from '@/client';

export function getAllQuestions<T extends TestRead | TestReadStripped>(test: T): NonNullable<T['questions']> {
  const standalone = test.questions ?? [];
  const grouped = (test.questionGroups ?? []).flatMap(g => g.questions ?? []);
  return [...standalone, ...grouped];
}
