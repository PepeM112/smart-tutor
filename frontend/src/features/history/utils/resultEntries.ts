import { AnswerStatus, type AnswerRead } from '@/client';
import { groupEarnedPoints, groupMaxPoints, questionPoints } from '@/features/tests/utils/points';

import {
  ExamItemType,
  computeQuestionScore,
  effectiveStatus,
  type ExamItem,
  type ResultGroup,
  type ResultQuestion,
} from '../components/resultDetailUtils';

/** One row of the result outline: a question or a group, with the mark that counts. */
export interface ResultEntry {
  /** The id of the question, or of the group. */
  id: string;
  number: number;
  title: string;
  status: AnswerStatus;
  /** `null` while the AI has not graded the answer, or when grading failed. */
  earnedPoints: number | null;
  maxPoints: number;
  isGroup: boolean;
}

export interface StatusCount {
  status: AnswerStatus;
  count: number;
}

const SUMMARY_STATUSES: AnswerStatus[] = [
  AnswerStatus.CORRECT,
  AnswerStatus.PARTIAL,
  AnswerStatus.WRONG,
  AnswerStatus.PENDING,
];

export interface NumberFormatter {
  number: (value: number, options: { maximumFractionDigits: number }) => string;
}

export function formatPoints(format: NumberFormatter, points: number): string {
  return format.number(points, { maximumFractionDigits: 2 });
}

// An unanswered question has no answer row: it counts as wrong.
function questionStatus(answer?: AnswerRead): AnswerStatus {
  return effectiveStatus(answer) ?? AnswerStatus.WRONG;
}

function earnedPointsOf(answer: AnswerRead | undefined, question: ResultQuestion): number | null {
  const status = questionStatus(answer);
  if (status === AnswerStatus.PENDING || status === AnswerStatus.FAILED) return null;
  const score = computeQuestionScore(answer, question);
  return score ? (score.pct / 100) * questionPoints(question) : 0;
}

export function aggregateStatus(statuses: AnswerStatus[]): AnswerStatus {
  if (statuses.some(status => status === AnswerStatus.PENDING)) return AnswerStatus.PENDING;
  if (statuses.every(status => status === AnswerStatus.CORRECT)) return AnswerStatus.CORRECT;
  if (statuses.every(status => status === AnswerStatus.WRONG || status === AnswerStatus.FAILED)) {
    return AnswerStatus.WRONG;
  }
  return AnswerStatus.PARTIAL;
}

function buildQuestionEntry(question: ResultQuestion, answer: AnswerRead | undefined, number: number): ResultEntry {
  return {
    id: question.id,
    number,
    title: question.prompt,
    status: questionStatus(answer),
    earnedPoints: earnedPointsOf(answer, question),
    maxPoints: questionPoints(question),
    isGroup: false,
  };
}

function buildGroupEntry(
  id: string,
  title: string,
  group: ResultGroup,
  answerMap: Map<string, AnswerRead>,
  number: number
): ResultEntry {
  const statuses = (group.questions ?? []).map(q => questionStatus(answerMap.get(q.id)));
  const status = aggregateStatus(statuses);
  return {
    id,
    number,
    title,
    status,
    earnedPoints: groupEarnedPoints(group, statuses),
    maxPoints: groupMaxPoints(group),
    isGroup: true,
  };
}

export function buildResultEntries(
  items: ExamItem[],
  answerMap: Map<string, AnswerRead>,
  groupFallbackTitle: string
): ResultEntry[] {
  return items.map((item, idx) => {
    const number = idx + 1;
    if (item.type === ExamItemType.QUESTION) {
      return buildQuestionEntry(item.question, answerMap.get(item.question.id), number);
    }
    const { group } = item;
    return buildGroupEntry(group.id ?? `group-${idx}`, group.title ?? groupFallbackTitle, group, answerMap, number);
  });
}

/** The counts of the summary line. A failed grading counts as wrong. Empty counts are left out. */
export function summarizeEntries(entries: ResultEntry[]): StatusCount[] {
  const bucketOf = (status: AnswerStatus): AnswerStatus =>
    status === AnswerStatus.FAILED ? AnswerStatus.WRONG : status;
  return SUMMARY_STATUSES.map(status => ({
    status,
    count: entries.filter(entry => bucketOf(entry.status) === status).length,
  })).filter(({ count }) => count > 0);
}
