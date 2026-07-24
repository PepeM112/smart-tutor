'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { type TestResultRead } from '@/client';
import { getScoreCircleClasses } from '@/features/history/utils/score-colors';
import { cn } from '@/lib/utils';

export function ScoreBanner({ result, testTitle }: { result: TestResultRead; testTitle: string }) {
  const t = useTranslations('history');
  const score = result.score ?? 0;
  const pending = result.pendingAnswers ?? 0;

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold">{testTitle}</h1>
        {result.totalPoints != null && result.totalPoints > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {result.earnedPoints} / {result.totalPoints} {t('pts')}
          </p>
        )}
        {pending > 0 && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" />
            {t('pending_questions', { count: pending })}
          </p>
        )}
      </div>
      <div
        className={cn(
          'flex items-center justify-center size-20 rounded-full border-[3px] shrink-0',
          getScoreCircleClasses(score)
        )}
      >
        <span className="text-lg font-bold tabular-nums">{score.toFixed(1)}%</span>
      </div>
    </div>
  );
}
