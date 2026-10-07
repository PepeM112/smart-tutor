'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { type LongTextContent, type QuestionListRead, QuestionType } from '@/client';
import { PreviewPanelFrame } from '@/components/shared/PreviewPanelFrame';
import { isMCContent, isSimpleContent } from '@/features/tests/utils/questionContent';
import { getQuestionTypeInfo } from '@/features/tests/utils/questionIcons';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

type Props = {
  question: QuestionListRead;
  onClose: () => void;
};

function isLongTextContent(content: unknown): content is LongTextContent {
  return content != null && typeof content === 'object' && 'rubric' in content && Array.isArray(content.rubric);
}

/**
 * Read-only preview of a question. The list row already has the full content,
 * so this panel makes no request.
 */
export function QuestionPreviewPanel({ question, onClose }: Props) {
  const t = useTranslations();
  const { icon: TypeIcon, labelKey } = getQuestionTypeInfo(question.questionType);

  return (
    <PreviewPanelFrame
      title={question.prompt}
      openHref={Routes.QUESTION_EDIT(question.id)}
      onClose={onClose}
      contentKey={question.id}
    >
      <div className="space-y-4">
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <TypeIcon className="size-3.5" />
          {t(labelKey)}
        </span>
        <p className="whitespace-pre-wrap font-medium text-foreground">{question.prompt}</p>
        {question.hint && <p className="text-sm text-muted-foreground">{t('exam.hint', { hint: question.hint })}</p>}
        <QuestionContent question={question} />
        {question.explanation && (
          <div className="border-t border-border pt-3">
            <p className="mb-0.5 text-xs text-muted-foreground">{t('history.explanation')}</p>
            <p className="whitespace-pre-wrap text-sm">{question.explanation}</p>
          </div>
        )}
      </div>
    </PreviewPanelFrame>
  );
}

function QuestionContent({ question }: { question: QuestionListRead }) {
  const t = useTranslations();
  const { content } = question;

  if (question.questionType === QuestionType.SIMPLE && isSimpleContent(content)) {
    return (
      <section className="space-y-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">{t('questions.accepted_answers')}</h3>
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
        <h3 className="text-xs font-medium text-muted-foreground">{t('questions.options_label')}</h3>
        <ul className="space-y-1.5">
          {content.options.map((option, index) => {
            const isCorrect = content.correctIndices.includes(index);
            return (
              <li
                // Options can repeat, so the index is part of the key.
                key={`${index}-${option}`}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm',
                  isCorrect && 'bg-feedback-correct-bg text-feedback-correct'
                )}
              >
                <span className="min-w-0 flex-1">{option}</span>
                {isCorrect && <Check className="size-4 shrink-0" />}
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
        <h3 className="text-xs font-medium text-muted-foreground">{t('questions.rubric_label')}</h3>
        <ul className="space-y-1.5">
          {content.rubric.map((criterion, index) => (
            <li
              key={`${index}-${criterion.point}`}
              className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                {criterion.point}
                {criterion.category && (
                  <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {criterion.category}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(criterion.weight * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return null;
}
