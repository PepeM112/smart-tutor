'use client';

import { Loader2 } from 'lucide-react';

import { AnswerStatus, type AnswerRead, type QuestionRead, QuestionType } from '@/client';
import { Card, CardContent } from '@/components/ui/card';
import {
  getScoreTextColor,
  getScoreRingColor,
  getScoreBgColor,
  getStatusRingColor,
  getStatusBgColor,
} from '@/features/history/utils/score-colors';
import { cn } from '@/lib/utils';

import { MultipleChoiceReview } from './multiple-choice-review';
import { computeLongTextScore, getCorrectAnswer, getUserAnswerDisplay } from './result-detail-utils';
import { StatusIcon } from './status-icon';

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
  const status = answer?.status ?? AnswerStatus.UNKNOWN;
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  const score = isLongText ? computeLongTextScore(answer, question) : null;

  const ringClass = score ? getScoreRingColor(score.pct) : getStatusRingColor(status);
  const bgClass = score ? getScoreBgColor(score.pct) : getStatusBgColor(status);

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
    >
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">
            <span className="text-muted-foreground mr-1.5">{number}.</span>
            {question.prompt}
          </p>
          {isLongText && !score && (status === AnswerStatus.UNKNOWN || !answer) ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
          ) : score ? (
            <span className={cn('text-sm font-semibold tabular-nums shrink-0', getScoreTextColor(score.pct))}>
              {score.label}
            </span>
          ) : (
            <StatusIcon status={status} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function NestedQuestionCard({ question, answer }: { question: QuestionRead; answer?: AnswerRead }) {
  const status = answer?.status ?? AnswerStatus.UNKNOWN;
  const isWrong = status === AnswerStatus.WRONG || status === AnswerStatus.PARTIAL;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;
  const correctAnswer = getCorrectAnswer(question);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{question.prompt}</p>
        <StatusIcon status={status} />
      </div>
      {question.hint && <p className="text-xs text-muted-foreground italic">Hint: {question.hint}</p>}
      {isMC ? (
        <MultipleChoiceReview question={question} userAnswer={answer?.userAnswer ?? ''} />
      ) : (
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Your answer: </span>
            <span className={cn(isWrong && 'line-through text-muted-foreground')}>
              {answer ? getUserAnswerDisplay(question, answer.userAnswer) : '(no answer)'}
            </span>
          </p>
          {isWrong && correctAnswer && (
            <p>
              <span className="text-muted-foreground">Correct answer: </span>
              <span className="text-feedback-correct font-medium">{correctAnswer}</span>
            </p>
          )}
        </div>
      )}
      {question.explanation && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">{question.explanation}</p>
      )}
    </div>
  );
}
