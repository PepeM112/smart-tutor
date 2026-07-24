'use client';

import { CircleAlert, CircleCheck, CircleX, Loader2 } from 'lucide-react';

import { AnswerStatus } from '@/client';
import { getStatusTextColor } from '@/features/history/utils/score-colors';
import { cn } from '@/lib/utils';

const STATUS_ICONS = {
  [AnswerStatus.CORRECT]: CircleCheck,
  [AnswerStatus.PARTIAL]: CircleAlert,
  [AnswerStatus.WRONG]: CircleX,
  [AnswerStatus.FAILED]: CircleX,
} as const;

export function StatusIcon({ status, className }: { status: AnswerStatus; className?: string }) {
  const base = cn('size-5 shrink-0', className);
  const Icon = STATUS_ICONS[status as keyof typeof STATUS_ICONS];

  if (!Icon) {
    return <Loader2 className={cn(base, 'text-muted-foreground animate-spin')} />;
  }

  return <Icon className={cn(base, getStatusTextColor(status))} />;
}
