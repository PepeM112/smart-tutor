'use client';

import { Dumbbell, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { type TestRead } from '@/client';
import { Button } from '@/components/ui/button';
import { getAllQuestions } from '@/features/tests/utils/questionCounts';
import { getQuestionTypeInfo } from '@/features/tests/utils/questionIcons';
import { toPlainPreview } from '@/lib/plainPreview';
import { Routes } from '@/lib/routes';

const FIRST_QUESTIONS_COUNT = 5;

/** The detail under a test row. The list already has the questions, so it makes no request. */
export function TestExpandedRow({ test }: { test: TestRead }) {
  const t = useTranslations();
  const headingId = useId();
  const questions = getAllQuestions(test);
  const firstQuestions = questions.slice(0, FIRST_QUESTIONS_COUNT);
  const hiddenCount = questions.length - firstQuestions.length;

  return (
    <div className="space-y-3">
      {test.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{test.description}</p>}
      <section aria-labelledby={headingId}>
        <h3 id={headingId} className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {t('tests.first_questions')}
        </h3>
        {questions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('tests.no_questions_yet')}</p>
        ) : (
          <ol className="mt-2 space-y-1.5">
            {firstQuestions.map((question, index) => {
              const { icon: Icon, labelKey } = getQuestionTypeInfo(question.questionType);
              return (
                <li key={question.id} className="flex items-start gap-2 text-sm">
                  <Icon role="img" aria-label={t(labelKey)} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1">
                    <span className="mr-1.5 text-muted-foreground tabular-nums">{index + 1}.</span>
                    {toPlainPreview(question.prompt)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        {hiddenCount > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">{t('tests.more_questions', { count: hiddenCount })}</p>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" icon={Dumbbell} asChild>
          <Link href={Routes.TEST_DETAIL(test.id)}>{t('tests.take_test_action')}</Link>
        </Button>
        <Button variant="outline" icon={Pencil} asChild>
          <Link href={Routes.TEST_EDIT(test.id)}>{t('common.edit')}</Link>
        </Button>
      </div>
    </div>
  );
}
