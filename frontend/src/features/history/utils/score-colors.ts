import { AnswerStatus } from '@/client';

// Unified thresholds: 80 / 65 / 35

export function getScoreTextColor(pct: number): string {
  if (pct >= 80) return 'text-green-600';
  if (pct >= 65) return 'text-amber-500';
  if (pct >= 35) return 'text-destructive';
  return 'text-foreground';
}

export function getScoreRingColor(pct: number): string {
  if (pct >= 80) return 'ring-green-500/40';
  if (pct >= 65) return 'ring-amber-500/40';
  if (pct >= 35) return 'ring-destructive/40';
  return 'ring-foreground/10';
}

export function getScoreBgColor(pct: number): string {
  if (pct >= 80) return 'bg-green-50 dark:bg-green-950/30';
  if (pct >= 65) return 'bg-amber-50 dark:bg-amber-950/30';
  if (pct >= 35) return 'bg-red-50 dark:bg-red-950/30';
  return 'bg-foreground/5';
}

export function getScoreCircleClasses(pct: number): string {
  if (pct >= 80) return 'border-green-500 bg-green-500/5 text-green-600';
  if (pct >= 65) return 'border-amber-500 bg-amber-500/5 text-amber-500';
  if (pct >= 35) return 'border-destructive bg-destructive/5 text-destructive';
  return 'border-foreground/20 bg-foreground/5 text-foreground';
}

export function getScoreBadgeClasses(pct: number): string {
  if (pct >= 80) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (pct >= 65) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  if (pct >= 35) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return 'bg-muted text-muted-foreground';
}

export function getStatusTextColor(status: AnswerStatus): string {
  switch (status) {
    case AnswerStatus.CORRECT:
      return 'text-green-600';
    case AnswerStatus.PARTIAL:
      return 'text-amber-500';
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
      return 'ring-green-500/40';
    case AnswerStatus.PARTIAL:
      return 'ring-amber-500/40';
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
      return 'bg-green-50 dark:bg-green-950/30';
    case AnswerStatus.PARTIAL:
      return 'bg-amber-50 dark:bg-amber-950/30';
    case AnswerStatus.WRONG:
    case AnswerStatus.FAILED:
      return 'bg-red-50 dark:bg-red-950/30';
    default:
      return 'bg-foreground/5';
  }
}
