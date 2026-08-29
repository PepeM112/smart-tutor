'use client';

import { Loader2 } from 'lucide-react';

import { AnswerStatus, type AnswerRead, type QuestionRead } from '@/client';
import { Card, CardContent } from '@/components/ui/card';
import {
  getScoreTextColor,
  getScoreRingColor,
  getScoreBgColor,
  getStatusRingColor,
  getStatusBgColor,
} from '@/features/history/utils/scoreColors';
import { cn } from '@/lib/utils';

import { NumberedScoreRow } from './NumberedScoreRow';
import { computeQuestionScore } from './resultDetailUtils';

export function CompactQuestionCard({
  question,
  answer,
  number,
  isSelected,
  disabled,
  onClick,
}: {
  question: QuestionRead;
  answer?: AnswerRead;
  number: number;
  isSelected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const score = computeQuestionScore(answer, question);
  const isFailed = answer?.status === AnswerStatus.FAILED;

  const ringClass = isFailed
    ? getStatusRingColor(AnswerStatus.FAILED)
    : score
      ? getScoreRingColor(score.pct)
      : getStatusRingColor(answer?.status ?? null);
  const bgClass = isFailed
    ? getStatusBgColor(AnswerStatus.FAILED)
    : score
      ? getScoreBgColor(score.pct)
      : getStatusBgColor(answer?.status ?? null);

  return (
    <Card
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={cn(
        'p-4 ring-1 transition-colors',
        ringClass,
        isSelected && bgClass,
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer select-none'
      )}
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        disabled
          ? undefined
          : e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
      }
    >
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">
            <span className="text-muted-foreground mr-1.5">{number}.</span>
            {question.prompt}
          </p>
          {isFailed ? (
            <span className="text-sm font-semibold text-destructive shrink-0">{score?.label}</span>
          ) : score ? (
            <span className={cn('text-sm font-semibold tabular-nums shrink-0', getScoreTextColor(score.pct))}>
              {score.label}
            </span>
          ) : (
            <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CompactGroupCard({
  title,
  correctCount,
  totalCount,
  number,
  isSelected,
  onClick,
}: {
  title: string;
  correctCount: number;
  totalCount: number;
  number: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const pct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
  const ringClass = getScoreRingColor(pct);
  const bgClass = getScoreBgColor(pct);

  return (
    <Card
      role="button"
      tabIndex={0}
      className={cn('p-4 ring-1 transition-colors cursor-pointer select-none', ringClass, isSelected && bgClass)}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="p-0">
        <NumberedScoreRow number={number} title={title} correctCount={correctCount} totalCount={totalCount} />
      </CardContent>
    </Card>
  );
}
