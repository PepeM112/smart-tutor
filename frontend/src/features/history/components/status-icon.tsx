'use client';

import { CircleAlert, CircleCheck, CircleX, Loader2 } from 'lucide-react';

import { AnswerStatus } from '@/client';
import { cn } from '@/lib/utils';

export function StatusIcon({ status, className }: { status: AnswerStatus; className?: string }) {
  const base = cn('size-5 shrink-0', className);
  switch (status) {
    case AnswerStatus.CORRECT:
      return <CircleCheck className={cn(base, 'text-feedback-correct')} />;
    case AnswerStatus.PARTIAL:
      return <CircleAlert className={cn(base, 'text-feedback-partial')} />;
    case AnswerStatus.WRONG:
      return <CircleX className={cn(base, 'text-destructive')} />;
    case AnswerStatus.FAILED:
      return <CircleX className={cn(base, 'text-destructive')} />;
    default:
      return <Loader2 className={cn(base, 'text-muted-foreground animate-spin')} />;
  }
}
