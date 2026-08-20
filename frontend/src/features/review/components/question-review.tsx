'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, Circle, MinusCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AnswerStatus, type QuestionReadStripped, QuestionType, type SrsStateResponse } from '@/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseMcAnswer, toggleMcOption } from '@/features/tests/utils/question-content';
import { cn } from '@/lib/utils';

import { feedbackBg, feedbackTextColor, statusLabelKey } from '../helpers';

export type CheckResult = {
  status: AnswerStatus;
  correctAnswers?: string[] | null;
  correctIndices?: number[] | null;
  srsState?: SrsStateResponse;
};

type Props = {
  question: QuestionReadStripped;
  answer: string;
  onAnswerChange: (answer: string) => void;
  onCheck: () => void;
  isChecking: boolean;
  checkResult: CheckResult | null;
  onNext: () => void;
  isLast: boolean;
};

export function QuestionReview({
  question,
  answer,
  onAnswerChange,
  onCheck,
  isChecking,
  checkResult,
  onNext,
  isLast,
}: Props) {
  const t = useTranslations();
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;
  const isSimple = question.questionType === QuestionType.SIMPLE;
  // SAFETY: isMC check below guards all MC-specific access; content is opaque JSON from the API
  const content = question.content as Record<string, unknown> | undefined;
  const isChecked = checkResult !== null;

  const statusLabel = (status: AnswerStatus) => t(statusLabelKey(status));

  const handleCheckboxToggle = (index: number) => {
    onAnswerChange(toggleMcOption(answer, index));
  };

  return (
    <>
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 space-y-6">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">{question.prompt}</p>
          {question.hint && (
            <p className="text-sm text-muted-foreground italic">{t('review.hint', { hint: question.hint })}</p>
          )}
        </div>

        {isSimple && (
          <Input
            placeholder={t('review.type_your_answer')}
            value={answer}
            onChange={e => onAnswerChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !isChecked && answer.trim()) onCheck();
            }}
            disabled={isChecked}
            className="text-center text-base h-12"
            autoFocus
          />
        )}

        {isMC &&
          content &&
          (isChecked && checkResult?.correctIndices ? (
            <MultipleChoiceReview
              options={(content.options ?? []) as string[]}
              answer={answer}
              correctIndices={checkResult.correctIndices}
            />
          ) : (
            <MultipleChoiceInput
              options={(content.options ?? []) as string[]}
              answer={answer}
              onToggle={handleCheckboxToggle}
            />
          ))}

        {!isChecked && (
          <Button
            className="w-full h-14 text-base font-semibold sm:h-12"
            size="lg"
            onClick={onCheck}
            loading={isChecking}
            disabled={!answer.trim()}
          >
            {t('common.check')}
          </Button>
        )}
      </div>

      {isChecked && checkResult && (
        <>
          <div className={cn('mx-auto max-w-2xl rounded-xl border p-5', feedbackBg(checkResult.status))}>
            <div className="flex items-center gap-3">
              <StatusIcon status={checkResult.status} />
              <div className="flex-1">
                <p className={cn('font-semibold', feedbackTextColor(checkResult.status))}>
                  {statusLabel(checkResult.status)}
                </p>
                {isSimple && checkResult.status !== AnswerStatus.CORRECT && checkResult.correctAnswers && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t('review.correct_answer')}{' '}
                    <span className="text-feedback-correct font-medium">{checkResult.correctAnswers.join(', ')}</span>
                  </p>
                )}
              </div>
            </div>

            {question.explanation && (
              <p className="text-sm text-muted-foreground mt-3 border-t border-border/50 pt-3">
                {question.explanation}
              </p>
            )}

            {/* Dev-only: exposes raw SRS state for debugging the spaced-repetition algorithm */}
            {process.env.NEXT_PUBLIC_DEV_MODE === 'true' && checkResult.srsState && (
              <div className="mt-3 border-t border-border/50 pt-3">
                <p className="text-xs font-mono text-muted-foreground">
                  SRS: ease={checkResult.srsState.easeFactor.toFixed(2)} interval={checkResult.srsState.interval}d reps=
                  {checkResult.srsState.repetitions} next=
                  {checkResult.srsState.nextReview
                    ? new Date(checkResult.srsState.nextReview).toLocaleDateString()
                    : 'n/a'}
                </p>
              </div>
            )}
          </div>

          <div className="mx-auto max-w-2xl">
            <Button
              className="w-full h-14 text-base font-semibold sm:h-12"
              size="lg"
              icon={ArrowRight}
              onClick={onNext}
            >
              {isLast ? t('common.finish') : t('common.next')}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function StatusIcon({ status }: { status: AnswerStatus }) {
  switch (status) {
    case AnswerStatus.CORRECT:
      return <CheckCircle2 className="size-5 text-feedback-correct shrink-0" />;
    case AnswerStatus.PARTIAL:
      return <AlertTriangle className="size-5 text-feedback-partial shrink-0" />;
    case AnswerStatus.WRONG:
      return <XCircle className="size-5 text-destructive shrink-0" />;
    default:
      return null;
  }
}

function MultipleChoiceInput({
  options,
  answer,
  onToggle,
}: {
  options: string[];
  answer: string;
  onToggle: (index: number) => void;
}) {
  const selected = parseMcAnswer(answer);

  return (
    <div className="space-y-2">
      {options.map((option, idx) => {
        const checked = selected.includes(idx);
        return (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
              checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            )}
            onClick={() => onToggle(idx)}
          >
            <Checkbox id={`review-opt-${idx}`} checked={checked} onCheckedChange={() => onToggle(idx)} />
            <Label
              htmlFor={`review-opt-${idx}`}
              className="text-sm cursor-pointer flex-1"
              onClick={e => e.preventDefault()}
            >
              {option}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

function MultipleChoiceReview({
  options,
  answer,
  correctIndices,
}: {
  options: string[];
  answer: string;
  correctIndices: number[];
}) {
  const selectedSet = new Set(parseMcAnswer(answer));
  const correctSet = new Set(correctIndices);

  return (
    <div className="space-y-1.5">
      {options.map((option, idx) => {
        const isSelected = selectedSet.has(idx);
        const isCorrect = correctSet.has(idx);

        let bg = '';
        let Icon = Circle;
        let iconColor = 'text-muted-foreground/40';

        if (isSelected && isCorrect) {
          bg = 'bg-feedback-correct-bg';
          Icon = CheckCircle2;
          iconColor = 'text-feedback-correct';
        } else if (!isSelected && isCorrect) {
          bg = 'bg-feedback-partial-bg';
          Icon = MinusCircle;
          iconColor = 'text-feedback-partial';
        } else if (isSelected && !isCorrect) {
          bg = 'bg-feedback-wrong-bg';
          Icon = XCircle;
          iconColor = 'text-destructive';
        }

        return (
          <div key={idx} className={cn('flex items-center gap-2 rounded-md px-3 py-2', bg)}>
            <Icon className={cn('size-4 shrink-0', iconColor)} />
            <span className="text-sm">{option}</span>
          </div>
        );
      })}
    </div>
  );
}
