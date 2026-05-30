'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  MinusCircle,
  XCircle,
} from 'lucide-react';

import { AnswerStatus, type QuestionRead, QuestionType } from '@/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { feedbackBg, feedbackTextColor, statusLabel } from '../helpers';

export type CheckResult = {
  status: AnswerStatus;
  correctAnswers?: string[] | null;
  correctIndices?: number[] | null;
};

type Props = {
  question: QuestionRead;
  answer: string;
  onAnswerChange: (answer: string) => void;
  onCheck: () => void;
  isChecking: boolean;
  checkResult: CheckResult | null;
  onNext: () => void;
  isLast: boolean;
};

function StatusIcon({ status }: { status: AnswerStatus }) {
  switch (status) {
    case AnswerStatus.CORRECT:
      return <CheckCircle2 className="size-5 text-green-600 shrink-0" />;
    case AnswerStatus.PARTIAL:
      return <AlertTriangle className="size-5 text-amber-500 shrink-0" />;
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
  const selected = answer ? answer.split(',').map(Number) : [];

  return (
    <div className="space-y-2">
      {options.map((option, idx) => {
        const checked = selected.includes(idx);
        return (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
              checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
            )}
            onClick={() => onToggle(idx)}
          >
            <Checkbox id={`review-opt-${idx}`} checked={checked} tabIndex={-1} />
            <Label htmlFor={`review-opt-${idx}`} className="text-sm cursor-pointer flex-1" onClick={e => e.preventDefault()}>
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
  const selectedSet = new Set(
    answer ? answer.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)) : [],
  );
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
          bg = 'bg-green-50 dark:bg-green-950/30';
          Icon = CheckCircle2;
          iconColor = 'text-green-600';
        } else if (!isSelected && isCorrect) {
          bg = 'bg-amber-50 dark:bg-amber-950/30';
          Icon = MinusCircle;
          iconColor = 'text-amber-500';
        } else if (isSelected && !isCorrect) {
          bg = 'bg-red-50 dark:bg-red-950/30';
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
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;
  const isSimple = question.questionType === QuestionType.SIMPLE;
  const content = question.content as Record<string, unknown> | undefined;
  const isChecked = checkResult !== null;

  const handleCheckboxToggle = (index: number) => {
    const selected = answer ? answer.split(',').map(Number) : [];
    const updated = selected.includes(index) ? selected.filter(i => i !== index) : [...selected, index];
    onAnswerChange(updated.sort((a, b) => a - b).join(','));
  };

  return (
    <>
      <Card className="mx-auto max-w-2xl p-8">
        <CardContent className="space-y-6 p-0">
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">{question.prompt}</p>
            {question.hint && (
              <p className="text-sm text-muted-foreground italic">Hint: {question.hint}</p>
            )}
          </div>

          {isSimple && (
            <Input
              placeholder="Type your answer..."
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

          {isMC && content && (
            isChecked && checkResult?.correctIndices ? (
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
            )
          )}

          {!isChecked && (
            <Button className="w-full" size="lg" onClick={onCheck} disabled={isChecking || !answer.trim()}>
              {isChecking ? <Loader2 className="animate-spin" /> : 'Check'}
            </Button>
          )}
        </CardContent>
      </Card>

      {isChecked && checkResult && (
        <div className={cn('mx-auto max-w-2xl rounded-xl border p-5', feedbackBg(checkResult.status))}>
          <div className="flex items-center gap-3">
            <StatusIcon status={checkResult.status} />
            <div className="flex-1">
              <p className={cn('font-semibold', feedbackTextColor(checkResult.status))}>
                {statusLabel(checkResult.status)}
              </p>
              {isSimple && checkResult.status !== AnswerStatus.CORRECT && checkResult.correctAnswers && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Correct answer:{' '}
                  <span className="text-green-600 font-medium">{checkResult.correctAnswers.join(', ')}</span>
                </p>
              )}
            </div>
          </div>

          {question.explanation && (
            <p className="text-sm text-muted-foreground mt-3 border-t border-border/50 pt-3">
              {question.explanation}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <Button size="lg" icon={ArrowRight} onClick={onNext}>
              {isLast ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
