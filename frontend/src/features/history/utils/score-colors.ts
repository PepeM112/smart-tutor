import { AnswerStatus } from '@/client';

// Unified thresholds: 80 / 65 / 35
// Colors use semantic tokens from globals.css (--color-feedback-*)

export function getScoreTextColor(pct: number): string {
  if (pct >= 80) return 'text-feedback-correct';
  if (pct >= 65) return 'text-feedback-partial';
  if (pct >= 35) return 'text-destructive';
  return 'text-foreground';
}

export function getScoreRingColor(pct: number): string {
  if (pct >= 80) return 'ring-feedback-correct/40';
  if (pct >= 65) return 'ring-feedback-partial/40';
  if (pct >= 35) return 'ring-destructive/40';
  return 'ring-foreground/10';
}

export function getScoreBgColor(pct: number): string {
  if (pct >= 80) return 'bg-feedback-correct-bg';
  if (pct >= 65) return 'bg-feedback-partial-bg';
  if (pct >= 35) return 'bg-feedback-wrong-bg';
  return 'bg-foreground/5';
}

export function getScoreCircleClasses(pct: number): string {
  if (pct >= 80) return 'border-feedback-correct bg-feedback-correct/5 text-feedback-correct';
  if (pct >= 65) return 'border-feedback-partial bg-feedback-partial/5 text-feedback-partial';
  if (pct >= 35) return 'border-destructive bg-destructive/5 text-destructive';
  return 'border-foreground/20 bg-foreground/5 text-foreground';
}

export function getScoreBadgeClasses(pct: number): string {
  if (pct >= 80) return 'bg-feedback-correct-bg text-feedback-correct';
  if (pct >= 65) return 'bg-feedback-partial-bg text-feedback-partial';
  if (pct >= 35) return 'bg-feedback-wrong-bg text-destructive';
  return 'bg-muted text-muted-foreground';
}

export function getStatusTextColor(status: AnswerStatus): string {
  switch (status) {
    case AnswerStatus.CORRECT:
      return 'text-feedback-correct';
    case AnswerStatus.PARTIAL:
      return 'text-feedback-partial';
    case AnswerStatus.WRONG:
    case AnswerStatus.FAILED:
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

export function getStatusRingColor(status: AnswerStatus): string {
  switch (status) {
    case AnswerStatus.CORRECT:
      return 'ring-feedback-correct/40';
    case AnswerStatus.PARTIAL:
      return 'ring-feedback-partial/40';
    case AnswerStatus.WRONG:
    case AnswerStatus.FAILED:
      return 'ring-destructive/40';
    default:
      return 'ring-foreground/10';
  }
}

export function getStatusBgColor(status: AnswerStatus): string {
  switch (status) {
    case AnswerStatus.CORRECT:
      return 'bg-feedback-correct-bg';
    case AnswerStatus.PARTIAL:
      return 'bg-feedback-partial-bg';
    case AnswerStatus.WRONG:
    case AnswerStatus.FAILED:
      return 'bg-feedback-wrong-bg';
    default:
      return 'bg-foreground/5';
  }
}
