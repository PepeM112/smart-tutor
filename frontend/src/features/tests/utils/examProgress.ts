import {
  QuestionType,
  type QuestionReadStripped,
  type TestQuestionGroupReadStripped,
  type TestReadStripped,
} from '@/client';

import { groupMaxPoints, questionPoints } from './points';
import { parseMcAnswer } from './questionContent';

export type ExamItem =
  | { kind: 'question'; question: QuestionReadStripped; order: number }
  | { kind: 'group'; group: TestQuestionGroupReadStripped; order: number };

/** One row of the exam outline: a standalone question or a whole group. */
export interface ExamEntry {
  /** The id of the page section. The outline jumps to it and the scrollspy reads it. */
  anchorId: string;
  number: number;
  title: string;
  points: number;
  answeredCount: number;
  totalCount: number;
  isGroup: boolean;
}

export interface ScrollspyEntry {
  anchorId: string;
  /** Distance from the top of the scroll area. */
  top: number;
}

export function buildExamItems(test: TestReadStripped): ExamItem[] {
  const questions: ExamItem[] = (test.questions ?? []).map(question => ({
    kind: 'question',
    question,
    order: question.order ?? 0,
  }));
  const groups: ExamItem[] = (test.questionGroups ?? []).map(group => ({
    kind: 'group',
    group,
    order: group.order ?? 0,
  }));

  return [...questions, ...groups].sort((a, b) => a.order - b.order);
}

export function examAnchorId(item: ExamItem, index: number): string {
  return `exam-item-${item.kind === 'question' ? item.question.id : (item.group.id ?? index)}`;
}

export function isQuestionAnswered(question: QuestionReadStripped, answer: string | undefined): boolean {
  if (!answer) return false;
  // "" is the answer of an MC question after the last option is unchecked.
  if (question.questionType === QuestionType.MULTIPLE_CHOICE) return parseMcAnswer(answer).length > 0;
  return answer.trim() !== '';
}

export function buildExamEntries(
  items: ExamItem[],
  answers: Record<string, string>,
  groupFallbackTitle: string
): ExamEntry[] {
  return items.map((item, index) => {
    const anchorId = examAnchorId(item, index);
    const number = index + 1;

    if (item.kind === 'question') {
      const isAnswered = isQuestionAnswered(item.question, answers[item.question.id]);
      return {
        anchorId,
        number,
        title: item.question.prompt,
        points: questionPoints(item.question),
        answeredCount: isAnswered ? 1 : 0,
        totalCount: 1,
        isGroup: false,
      };
    }

    const questions = item.group.questions ?? [];
    return {
      anchorId,
      number,
      title: item.group.title ?? groupFallbackTitle,
      points: groupMaxPoints(item.group),
      answeredCount: questions.filter(question => isQuestionAnswered(question, answers[question.id])).length,
      totalCount: questions.length,
      isGroup: true,
    };
  });
}

/** An entry counts as answered when all its questions are. */
export function isEntryAnswered(entry: ExamEntry): boolean {
  return entry.totalCount > 0 && entry.answeredCount === entry.totalCount;
}

/**
 * The entry the reader is on: the last one whose top has passed `offset`. At the bottom of the page the last
 * entry wins, because a short last question can never reach `offset`.
 */
export function pickActiveAnchor(entries: ScrollspyEntry[], offset: number, isAtBottom: boolean): string | null {
  if (isAtBottom) return entries.at(-1)?.anchorId ?? null;
  return (entries.filter(entry => entry.top <= offset).at(-1) ?? entries[0])?.anchorId ?? null;
}

/** The nearest ancestor that scrolls. The page of an outline column scrolls inside a panel, not the window. */
export function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  const parent = element?.parentElement ?? null;
  if (!parent) return null;
  return /(auto|scroll)/.test(getComputedStyle(parent).overflowY) ? parent : findScrollParent(parent);
}
