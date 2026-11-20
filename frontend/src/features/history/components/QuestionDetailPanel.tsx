'use client';

import { useTranslations } from 'next-intl';

import { type AnswerRead, QuestionType } from '@/client';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { AnswerGradePanel } from './AnswerGradePanel';
import { LongTextReview } from './LongTextReview';
import { MultipleChoiceReview } from './MultipleChoiceReview';
import {
  effectiveStatus,
  getCorrectAnswer,
  getUserAnswerDisplay,
  isAnswerWrong,
  type ResultQuestion,
} from './resultDetailUtils';

interface QuestionDetailPanelProps {
  question: ResultQuestion;
  answer?: AnswerRead;
}

/** What the student answered and how it was graded. The prompt is drawn by the caller. */
export function QuestionDetailPanel({ question, answer }: QuestionDetailPanelProps) {
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;

  return (
    <div className="space-y-6">
      {isLongText ? (
        <>
          <QuestionHint hint={question.hint} />
          <LongTextReview question={question} answer={answer} />
          {question.explanation && <p className="text-sm text-muted-foreground">{question.explanation}</p>}
        </>
      ) : isMC ? (
        <MCQuestionDetail question={question} answer={answer} />
      ) : (
        <SimpleQuestionDetail question={question} answer={answer} />
      )}
      {answer && <AnswerGradePanel answer={answer} question={question} />}
    </div>
  );
}

function SimpleQuestionDetail({ question, answer }: { question: ResultQuestion; answer?: AnswerRead }) {
  const t = useTranslations();
  const status = effectiveStatus(answer);
  const isWrong = isAnswerWrong(status);
  const correctAnswer = getCorrectAnswer(question);

  return (
    <div className="space-y-3">
      <QuestionHint hint={question.hint} />
      <div className="space-y-2 text-sm">
        <div>
          <p className="text-muted-foreground mb-0.5">{t('history.your_answer')}</p>
          <p className={cn('rounded-lg bg-muted p-3', isWrong && 'line-through text-muted-foreground')}>
            {(answer && getUserAnswerDisplay(question, answer.userAnswer)) ?? t('history.no_answer')}
          </p>
        </div>
        {correctAnswer && (
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-muted-foreground">{t('history.correct_answer')}</p>
              {question.explanation && <Tooltip content={question.explanation} />}
            </div>
            <p className="rounded-lg bg-muted p-3 text-feedback-correct font-medium">{correctAnswer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MCQuestionDetail({ question, answer }: { question: ResultQuestion; answer?: AnswerRead }) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      <QuestionHint hint={question.hint} />
      <MultipleChoiceReview question={question} userAnswer={answer?.userAnswer ?? ''} />
      {question.explanation && (
        <div className="flex items-center gap-1.5">
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
  return <p className="text-sm text-muted-foreground italic">{t('review.hint', { hint })}</p>;
}
