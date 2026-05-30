import { AnswerStatus } from '@/client';

export const REVIEW_BATCH_SIZE = 10;

export function statusLabel(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'Correct!';
    case AnswerStatus.PARTIAL:
      return 'Almost! (typo)';
    case AnswerStatus.WRONG:
      return 'Wrong';
    default:
      return 'Pending';
  }
}

export function feedbackBg(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30';
    case AnswerStatus.PARTIAL:
      return 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30';
    case AnswerStatus.WRONG:
      return 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30';
    default:
      return '';
  }
}

export function feedbackTextColor(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'text-green-600';
    case AnswerStatus.PARTIAL:
      return 'text-amber-500';
    case AnswerStatus.WRONG:
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}
