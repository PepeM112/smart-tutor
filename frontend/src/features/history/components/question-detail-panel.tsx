'use client';

import { useTranslations } from 'next-intl';

import { type AnswerRead, type QuestionRead, QuestionType } from '@/client';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { LongTextReview } from './long-text-review';
import { MultipleChoiceReview } from './multiple-choice-review';
import { getCorrectAnswer, getUserAnswerDisplay, isAnswerWrong } from './result-detail-utils';

export function QuestionDetailPanel({
  question,
  answer,
  number,
}: {
  question: QuestionRead;
  answer?: AnswerRead;
  number: number;
}) {
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;

  return (
    <div className="space-y-4">
      <p className="font-medium">
        <span className="text-muted-foreground mr-1.5">{number}.</span>
        {question.prompt}
      </p>
      {isLongText ? (
        <>
          <QuestionHint hint={question.hint} />
          <LongTextReview answer={answer} />
          {question.explanation && (
            <p className="text-xs text-muted-foreground border-t border-border pt-2">{question.explanation}</p>
          )}
        </>
      ) : isMC ? (
        <MCQuestionDetail question={question} answer={answer} />
      ) : (
        <SimpleQuestionDetail question={question} answer={answer} />
      )}
    </div>
  );
}

function SimpleQuestionDetail({ question, answer }: { question: QuestionRead; answer?: AnswerRead }) {
  const t = useTranslations();
  const status = answer?.status ?? null;
  const isWrong = isAnswerWrong(status);
  const correctAnswer = getCorrectAnswer(question);

  return (
    <div className="space-y-3">
      <QuestionHint hint={question.hint} />
      <div className="space-y-2 text-sm">
        <div>
          <p className="text-muted-foreground mb-0.5">{t('history.your_answer')}</p>
          <p className={cn('rounded-md bg-muted/50 p-3', isWrong && 'line-through text-muted-foreground')}>
            {(answer && getUserAnswerDisplay(question, answer.userAnswer)) ?? t('history.no_answer')}
          </p>
        </div>
        {correctAnswer && (
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-muted-foreground">{t('history.correct_answer')}</p>
              {question.explanation && <Tooltip content={question.explanation} />}
            </div>
            <p className="rounded-md bg-muted/50 p-3 text-feedback-correct font-medium">{correctAnswer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MCQuestionDetail({ question, answer }: { question: QuestionRead; answer?: AnswerRead }) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      <QuestionHint hint={question.hint} />
      <MultipleChoiceReview question={question} userAnswer={answer?.userAnswer ?? ''} />
      {question.explanation && (
        <div className="flex items-center gap-1.5 border-t border-border pt-2">
          <Tooltip content={question.explanation} />
          <p className="text-xs text-muted-foreground">{t('history.explanation')}</p>
        </div>
      )}
    </div>
  );
}

function QuestionHint({ hint }: { hint?: string | null }) {
  const t = useTranslations();
  if (!hint) return null;
  return <p className="-mt-2 text-sm text-muted-foreground italic">{t('review.hint', { hint })}</p>;
}
