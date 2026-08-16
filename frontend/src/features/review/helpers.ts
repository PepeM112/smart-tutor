import { AnswerStatus } from '@/client';

export const REVIEW_BATCH_SIZE = 10;

export function statusLabel(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'Correct';
    case AnswerStatus.PARTIAL:
      return 'Almost correct (typo)';
    case AnswerStatus.WRONG:
      return 'Wrong';
    default:
      return 'Pending';
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
