import {
  AnswerStatus,
  type AnswerRead,
  type QuestionRead,
  QuestionType,
  type TestQuestionGroupRead,
  type TestRead,
} from '@/client';
import { isMCContent, isSimpleContent } from '@/features/tests/utils/question-content';

export type ExamItem =
  | { kind: 'question'; question: QuestionRead; order: number }
  | { kind: 'group'; group: TestQuestionGroupRead; order: number };

export function buildExamItems(test: TestRead): ExamItem[] {
  const items: ExamItem[] = [];
  for (const q of test.questions ?? []) {
    items.push({ kind: 'question', question: q, order: q.order ?? 0 });
  }
  for (const g of test.questionGroups ?? []) {
    items.push({ kind: 'group', group: g, order: g.order ?? 0 });
  }
  return items.sort((a, b) => a.order - b.order);
}

export type LongTextScore = { label: string; pct: number };

export function computeLongTextScore(answer?: AnswerRead, question?: QuestionRead): LongTextScore | null {
  if (!answer?.rubricResult || answer.rubricResult.length === 0) return null;
  const items = answer.rubricResult;
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  const earnedWeight = items.filter(i => i.met).reduce((sum, i) => sum + i.weight, 0);
  const pct = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
  const maxPoints = question?.points ?? 1;
  const earned = totalWeight > 0 ? (earnedWeight / totalWeight) * maxPoints : 0;
  return { label: `${earned.toFixed(2)}/${maxPoints.toFixed(2)}`, pct };
}

export function getCorrectAnswer(question: QuestionRead): string {
  const { content } = question;
  if (question.questionType === QuestionType.SIMPLE && isSimpleContent(content)) {
    return content.answers.join(', ');
  }
  if (question.questionType === QuestionType.MULTIPLE_CHOICE && isMCContent(content)) {
    return content.correct_indices
      .map(i => content.options[i])
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

export function parseSelectedIndices(userAnswer: string): number[] {
  return userAnswer
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
}

export function getUserAnswerDisplay(question: QuestionRead, userAnswer: string): string {
  const { content } = question;
  if (question.questionType === QuestionType.MULTIPLE_CHOICE && isMCContent(content)) {
    return (
      parseSelectedIndices(userAnswer)
        .map(i => content.options[i])
        .filter(Boolean)
        .join(', ') || '(no answer)'
    );
  }
  return userAnswer || '(no answer)';
}

export function countCorrectInGroup(questions: QuestionRead[], answerMap: Map<string, AnswerRead>): number {
  return questions.filter(q => answerMap.get(q.id)?.status === AnswerStatus.CORRECT).length;
}
