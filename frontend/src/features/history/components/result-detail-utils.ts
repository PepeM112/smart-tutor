import {
  AnswerStatus,
  type AnswerRead,
  type QuestionRead,
  QuestionType,
  type TestQuestionGroupRead,
  type TestRead,
} from '@/client';
import { isMCContent, isSimpleContent } from '@/features/tests/utils/question-content';

export enum ExamItemType {
  QUESTION = 'question',
  GROUP = 'group',
}

export type ExamItem =
  | { type: ExamItemType.QUESTION; question: QuestionRead; order: number }
  | { type: ExamItemType.GROUP; group: TestQuestionGroupRead; order: number };

export function buildExamItems(test: TestRead): ExamItem[] {
  const items: ExamItem[] = [];
  for (const q of test.questions ?? []) {
    items.push({ type: ExamItemType.QUESTION, question: q, order: q.order ?? 0 });
  }
  for (const g of test.questionGroups ?? []) {
    items.push({ type: ExamItemType.GROUP, group: g, order: g.order ?? 0 });
  }
  return items.sort((a, b) => a.order - b.order);
}

export type QuestionScore = { label: string; pct: number };

export function computeQuestionScore(answer?: AnswerRead, question?: QuestionRead): QuestionScore | null {
  if (!answer || answer.status === AnswerStatus.UNKNOWN || answer.status === AnswerStatus.PENDING) return null;

  const maxPoints = question?.points ?? 1;

  if (question?.questionType === QuestionType.LONG_TEXT) {
    if (!answer.rubricResult || answer.rubricResult.length === 0) return null;
    const totalWeight = answer.rubricResult.reduce((sum, i) => sum + i.weight, 0);
    const earnedWeight = answer.rubricResult.filter(i => i.met).reduce((sum, i) => sum + i.weight, 0);
    const pct = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
    const earned = totalWeight > 0 ? (earnedWeight / totalWeight) * maxPoints : 0;
    return { label: `${earned.toFixed(2)}/${maxPoints.toFixed(2)}`, pct };
  }

  let earned = 0;
  if (answer.status === AnswerStatus.CORRECT) earned = maxPoints;
  else if (answer.status === AnswerStatus.PARTIAL) earned = maxPoints * 0.5;

  const pct = maxPoints > 0 ? (earned / maxPoints) * 100 : 0;
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
  return questions.reduce((sum, q) => {
    const status = answerMap.get(q.id)?.status;
    if (status === AnswerStatus.CORRECT) return sum + 1;
    if (status === AnswerStatus.PARTIAL) return sum + 0.5;
    return sum;
  }, 0);
}
