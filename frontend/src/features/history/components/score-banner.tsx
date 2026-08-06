'use client';

import { Info, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { type TestResultRead } from '@/client';
import { Tooltip } from '@/components/ui/tooltip';
import { getScoreCircleClasses } from '@/features/history/utils/score-colors';
import { cn } from '@/lib/utils';

type Props = {
  result: TestResultRead;
  testTitle: string;
  isOlderVersion?: boolean;
};

export function ScoreBanner({ result, testTitle, isOlderVersion }: Props) {
  const t = useTranslations('history');
  const score = result.score ?? 0;
  const pending = result.pendingAnswers ?? 0;

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{testTitle}</h1>
          {isOlderVersion && (
            <Tooltip content={t('older_version_notice')}>
              <Info className="size-4 text-muted-foreground shrink-0" />
            </Tooltip>
          )}
        </div>
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
