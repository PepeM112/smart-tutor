'use client';

import { Check, Clock, Contrast, Minus, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AnswerStatus } from '@/client';
import { getStatusTextColor } from '@/features/history/utils/scoreColors';
import { cn } from '@/lib/utils';

const MARK_ICONS: Record<AnswerStatus, LucideIcon> = {
  [AnswerStatus.CORRECT]: Check,
  [AnswerStatus.PARTIAL]: Contrast,
  [AnswerStatus.WRONG]: X,
  [AnswerStatus.PENDING]: Clock,
  [AnswerStatus.FAILED]: Minus,
};

const MARK_WORD_KEYS: Record<AnswerStatus, string> = {
  [AnswerStatus.CORRECT]: 'history.mark_correct',
  [AnswerStatus.PARTIAL]: 'history.mark_partial',
  [AnswerStatus.WRONG]: 'history.mark_wrong',
  [AnswerStatus.PENDING]: 'history.mark_pending',
  [AnswerStatus.FAILED]: 'history.mark_failed',
};

interface ResultMarkProps {
  status: AnswerStatus;
  /** Off where a text next to the mark already names the state (the summary line). */
  showWord?: boolean;
}

/** The state of an answer: a mark and a word, so the state never rests on color alone. */
export function ResultMark({ status, showWord = true }: ResultMarkProps) {
  const t = useTranslations();
  const Icon = MARK_ICONS[status];

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', getStatusTextColor(status))}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {showWord && t(MARK_WORD_KEYS[status])}
    </span>
  );
}
