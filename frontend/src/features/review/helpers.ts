import { AnswerStatus, type SpaceSummary } from '@/client';

export const REVIEW_BATCH_SIZE = 10;

/** Review scope values the API accepts besides a course id. */
export const REVIEW_SCOPE_ALL = 'all';
export const REVIEW_SCOPE_PERSONAL = 'personal';

export type ReviewScopeOption = { value: string; label: string };

type ScopeCourse = Pick<SpaceSummary, 'id' | 'title' | 'includeInSrs'>;

/**
 * The options of the scope select: All, Personal, then each course with Include in Review on.
 * A course that did not opt in has no questions in Review, so it has no option.
 */
export function reviewScopeOptions(
  courses: readonly ScopeCourse[],
  labels: { all: string; personal: string }
): ReviewScopeOption[] {
  return [
    { value: REVIEW_SCOPE_ALL, label: labels.all },
    { value: REVIEW_SCOPE_PERSONAL, label: labels.personal },
    ...courses.filter(c => c.includeInSrs === true).map(c => ({ value: c.id, label: c.title })),
  ];
}

/** Falls back to All when the chosen course is no longer an option (the user left it or turned it off). */
export function resolveReviewScope(scope: string, options: readonly ReviewScopeOption[]): string {
  return options.some(o => o.value === scope) ? scope : REVIEW_SCOPE_ALL;
}

export function statusLabelKey(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'review.status_correct';
    case AnswerStatus.PARTIAL:
      return 'review.status_partial';
    case AnswerStatus.WRONG:
      return 'review.status_wrong';
    default:
      return 'review.status_pending';
  }
}

export function feedbackBg(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'border-feedback-correct-border bg-feedback-correct-bg';
    case AnswerStatus.PARTIAL:
      return 'border-feedback-partial-border bg-feedback-partial-bg';
    case AnswerStatus.WRONG:
      return 'border-feedback-wrong-border bg-feedback-wrong-bg';
    default:
      return '';
  }
}

export function feedbackTextColor(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'text-feedback-correct';
    case AnswerStatus.PARTIAL:
      return 'text-feedback-partial';
    case AnswerStatus.WRONG:
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}
