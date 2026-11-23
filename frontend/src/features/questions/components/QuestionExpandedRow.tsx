'use client';

import { Check, Copy, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { type QuestionListRead, QuestionType } from '@/client';
import { RichText } from '@/components/RichText';
import { Button } from '@/components/ui/button';
import { isLongTextContent, isMCContent, isSimpleContent } from '@/features/tests/utils/questionContent';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

interface QuestionExpandedRowProps {
  question: QuestionListRead;
  onDuplicate: () => void;
  isDuplicating: boolean;
}

/** The detail under a question row. The list row already has the full content, so it makes no request. */
export function QuestionExpandedRow({ question, onDuplicate, isDuplicating }: QuestionExpandedRowProps) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      {question.hint && <p className="text-sm text-muted-foreground">{t('exam.hint', { hint: question.hint })}</p>}
      <QuestionContent question={question} />
      {question.tags && question.tags.length > 0 && (
        <section className="space-y-1.5">
          <SectionTitle>{t('questions.tags_label')}</SectionTitle>
          <ul className="flex flex-wrap gap-1.5">
            {question.tags.map(tag => (
              <li key={tag} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80">
                {tag}
              </li>
            ))}
          </ul>
        </section>
      )}
      {question.explanation && (
        <div>
          <SectionTitle>{t('history.explanation')}</SectionTitle>
          <p className="mt-1 text-sm whitespace-pre-wrap">{question.explanation}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" icon={Pencil} asChild>
          <Link href={Routes.QUESTION_EDIT(question.id)}>{t('questions.edit_question')}</Link>
        </Button>
        <Button variant="outline" icon={Copy} disabled={isDuplicating} onClick={onDuplicate}>
          {t('questions.duplicate')}
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{children}</h3>;
}

function QuestionContent({ question }: { question: QuestionListRead }) {
  const t = useTranslations();
  const { content } = question;

  if (question.questionType === QuestionType.SIMPLE && isSimpleContent(content)) {
    return (
      <section className="space-y-1.5">
        <SectionTitle>{t('questions.accepted_answers')}</SectionTitle>
        <ul className="flex flex-wrap gap-1.5">
          {content.answers.map(answer => (
            <li key={answer} className="rounded-md bg-feedback-correct-bg px-2 py-1 text-sm text-feedback-correct">
              {answer}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (question.questionType === QuestionType.MULTIPLE_CHOICE && isMCContent(content)) {
    return (
      <section className="space-y-1.5">
        <SectionTitle>{t('questions.options_label')}</SectionTitle>
        <ul className="space-y-1.5">
          {content.options.map((option, index) => {
            const isCorrect = content.correctIndices.includes(index);
            return (
              <li
                // Options can repeat, so the index is part of the key.
                key={`${index}-${option}`}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-hairline bg-card px-3 py-2 text-sm',
                  isCorrect && 'bg-feedback-correct-bg text-feedback-correct'
                )}
              >
                <RichText text={option} className="min-w-0 flex-1" />
                {isCorrect && (
                  <>
                    <Check aria-hidden className="size-4 shrink-0" />
                    <span className="sr-only">{t('questions.correct_option')}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  if (question.questionType === QuestionType.LONG_TEXT && isLongTextContent(content)) {
    return (
      <section className="space-y-1.5">
        <SectionTitle>{t('questions.rubric_label')}</SectionTitle>
        <ul className="space-y-1.5">
          {content.rubric.map((criterion, index) => (
            <li
              key={`${index}-${criterion.point}`}
              className="flex items-start gap-2 rounded-md border border-hairline bg-card px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <RichText text={criterion.point} inline />
                {criterion.category && (
                  <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {criterion.category}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{Math.round(criterion.weight * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return null;
}
