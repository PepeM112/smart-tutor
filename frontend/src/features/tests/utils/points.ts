import { AnswerStatus } from '@/client';

type Scored = { points?: number } | undefined;

// Same default as the backend model: a question or group with no points set is worth 1.
export function questionPoints(question: Scored): number {
  return question?.points ?? 1;
}

/** A group is worth its own points, not the sum of its questions. The server scores it that way. */
export function groupMaxPoints(group: Scored): number {
  return group?.points ?? 1;
}

const STATUS_CREDIT: Partial<Record<AnswerStatus, number>> = {
  [AnswerStatus.CORRECT]: 1,
  [AnswerStatus.PARTIAL]: 0.5,
};

/**
 * The points of a group, like `correction_service`: the share of credit of its questions (correct 1, partial 0.5)
 * times the group points. `null` while one answer is pending. An unanswered question is passed as WRONG.
 */
export function groupEarnedPoints(group: Scored, statuses: AnswerStatus[]): number | null {
  if (statuses.some(status => status === AnswerStatus.PENDING)) return null;
  if (statuses.length === 0) return 0;
  const credit = statuses.reduce((sum, status) => sum + (STATUS_CREDIT[status] ?? 0), 0);
  return (groupMaxPoints(group) * credit) / statuses.length;
}
