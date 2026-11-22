'use client';

import { CircleAlert, CircleCheck, CircleX, Loader2, type LucideIcon } from 'lucide-react';

import { AnswerStatus } from '@/client';
import { getStatusTextColor } from '@/features/history/utils/scoreColors';
import { cn } from '@/lib/utils';

const STATUS_ICONS: Partial<Record<AnswerStatus, LucideIcon>> = {
  [AnswerStatus.CORRECT]: CircleCheck,
  [AnswerStatus.PARTIAL]: CircleAlert,
  [AnswerStatus.WRONG]: CircleX,
  [AnswerStatus.FAILED]: CircleX,
};

export function StatusIcon({ status, className }: { status: AnswerStatus | null; className?: string }) {
  const base = cn('size-5 shrink-0', className);
  const Icon = status === null ? undefined : STATUS_ICONS[status];

  if (!Icon) {
    return <Loader2 className={cn(base, 'text-muted-foreground animate-spin')} />;
  }

  return <Icon className={cn(base, getStatusTextColor(status))} />;
}
