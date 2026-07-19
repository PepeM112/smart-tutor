'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AnswerStatus } from '@/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { CheckedQuestion } from './review-session';

export function BatchSummary({
  results,
  onContinue,
  isLoading,
  exhausted,
}: {
  results: CheckedQuestion[];
  onContinue: () => void;
  isLoading: boolean;
  exhausted: boolean;
}) {
  const t = useTranslations('review');
  const tCommon = useTranslations('common');
  const correct = results.filter(r => r.status === AnswerStatus.CORRECT).length;
  const partial = results.filter(r => r.status === AnswerStatus.PARTIAL).length;
  const wrong = results.filter(r => r.status === AnswerStatus.WRONG).length;
  const total = results.length;
  const score = total > 0 ? (correct / total) * 100 : 0;

  const bannerColor =
    score >= 80
      ? 'border-feedback-correct-border bg-feedback-correct-bg'
      : score >= 50
        ? 'border-feedback-partial-border bg-feedback-partial-bg'
        : 'border-feedback-wrong-border bg-feedback-wrong-bg';

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-12">
      <div className={cn('w-full max-w-md rounded-xl border p-6 text-center', bannerColor)}>
        <p className="text-3xl font-bold">{score.toFixed(0)}%</p>
        <p className="text-sm text-muted-foreground mt-1">{t('correct', { correct, partial, wrong, total })}</p>
      </div>

      {exhausted ? (
        <p className="text-sm text-muted-foreground">{t('all_reviewed')}</p>
      ) : (
        <Button size="lg" icon={isLoading ? Loader2 : RefreshCw} onClick={onContinue} disabled={isLoading}>
          {isLoading ? tCommon('loading') : t('keep_reviewing')}
        </Button>
      )}
    </div>
  );
}
