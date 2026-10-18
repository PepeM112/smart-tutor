import {
  AnswerStatus,
  type AnswerRead,
  type QuestionRead,
  type QuestionReadStripped,
  type RubricResultItem,
  QuestionType,
  type TestQuestionGroupRead,
  type TestQuestionGroupReadStripped,
  type TestRead,
  type TestReadStripped,
} from '@/client';
import { isMCContent, isSimpleContent, parseMcAnswer } from '@/features/tests/utils/questionContent';

/**
 * A result shows the test as it was taken. When the student may not see the answers yet
 * (course tests, `RevealAnswers`), the API sends the stripped forms: no answer key, no rubric.
 */
export type ResultTest = TestRead | TestReadStripped;
export type ResultQuestion = QuestionRead | QuestionReadStripped;
export type ResultGroup = TestQuestionGroupRead | TestQuestionGroupReadStripped;

export enum ExamItemType {
  QUESTION = 'question',
  GROUP = 'group',
}

export type ExamItem =
  | { type: ExamItemType.QUESTION; question: ResultQuestion; order: number }
  | { type: ExamItemType.GROUP; group: ResultGroup; order: number };

export function buildExamItems(test: ResultTest): ExamItem[] {
  const items: ExamItem[] = [
    ...(test.questions ?? []).map(q => ({ type: ExamItemType.QUESTION as const, question: q, order: q.order ?? 0 })),
    ...(test.questionGroups ?? []).map(g => ({ type: ExamItemType.GROUP as const, group: g, order: g.order ?? 0 })),
  ];
  return items.sort((a, b) => a.order - b.order);
}

// met is tri-state: null = challenge pending, true/false = AI re-evaluation overrides original verdict
export function effectiveMet(item: RubricResultItem): boolean {
  if (item.challengeResult != null && item.challengeResult.met != null) {
    return item.challengeResult.met;
  }
  return item.met;
}

export type QuestionScore = { label: string; pct: number };

export function computeQuestionScore(answer?: AnswerRead, question?: ResultQuestion): QuestionScore | null {
  if (!answer || answer.status === AnswerStatus.PENDING) return null;

  const maxPoints = question?.points ?? 1;

  if (answer.status === AnswerStatus.FAILED) {
    // -1 sentinel — callers branch on answer.status === FAILED before reading pct
    return { label: `—/${maxPoints.toFixed(2)}`, pct: -1 };
  }

  if (question?.questionType === QuestionType.LONG_TEXT) {
    if (!answer.rubricResult || answer.rubricResult.length === 0) return null;
    const totalWeight = answer.rubricResult.reduce((sum, i) => sum + i.weight, 0);
    const earnedWeight = answer.rubricResult.filter(effectiveMet).reduce((sum, i) => sum + i.weight, 0);
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

export function getCorrectAnswer(question: ResultQuestion): string {
  const { content } = question;
  if (question.questionType === QuestionType.SIMPLE && isSimpleContent(content)) {
    return content.answers.join(', ');
  }
  if (question.questionType === QuestionType.MULTIPLE_CHOICE && isMCContent(content)) {
    return content.correctIndices
      .map((i: number) => content.options[i])
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

export function parseSelectedIndices(userAnswer: string): number[] {
  return parseMcAnswer(userAnswer);
}

/** The options of a multiple choice question. A stripped question has them too, but no answer key. */
export function getMcOptions(question: ResultQuestion): string[] | null {
  const { content } = question;
  if (question.questionType !== QuestionType.MULTIPLE_CHOICE) return null;
  return 'options' in content && Array.isArray(content.options) ? content.options : null;
}

export function getUserAnswerDisplay(question: ResultQuestion, userAnswer: string): string {
  const options = getMcOptions(question);
  if (options) {
    return parseSelectedIndices(userAnswer)
      .map(i => options[i])
      .filter(Boolean)
      .join(', ');
  }
  return userAnswer || '';
}

export function isAnswerWrong(status: AnswerStatus | null): boolean {
  return status === AnswerStatus.WRONG || status === AnswerStatus.PARTIAL;
}

// PARTIAL answers earn half credit toward the group's score
export function countCorrectInGroup(questions: ResultQuestion[], answerMap: Map<string, AnswerRead>): number {
  return questions.reduce((sum, q) => {
    const status = answerMap.get(q.id)?.status;
    if (status === AnswerStatus.CORRECT) return sum + 1;
    if (status === AnswerStatus.PARTIAL) return sum + 0.5;
    return sum;
  }, 0);
}
