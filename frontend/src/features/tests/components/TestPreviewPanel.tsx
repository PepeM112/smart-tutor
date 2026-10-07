'use client';

import { useTranslations } from 'next-intl';

import { type QuestionRead, type TestRead } from '@/client';
import { PreviewPanelFrame } from '@/components/shared/PreviewPanelFrame';
import { buildExamItems, ExamItemType } from '@/features/history/components/resultDetailUtils';
import { getQuestionTypeInfo } from '@/features/tests/utils/questionIcons';
import { Routes } from '@/lib/routes';

type Props = {
  test: TestRead;
  onClose: () => void;
};

/**
 * Read-only preview of a test: title, description and the ordered questions (groups indented).
 * The list row already has the questions, so this panel makes no request.
 */
export function TestPreviewPanel({ test, onClose }: Props) {
  const t = useTranslations();
  const items = buildExamItems(test);

  return (
    <PreviewPanelFrame title={test.title} openHref={Routes.TEST_EDIT(test.id)} onClose={onClose} contentKey={test.id}>
      <div className="space-y-4">
        {test.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{test.description}</p>}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tests.no_questions_yet')}</p>
        ) : (
          <ol className="space-y-2">
            {items.map((item, index) =>
              item.type === ExamItemType.QUESTION ? (
                <li key={item.question.id}>
                  <QuestionLine number={index + 1} question={item.question} />
                </li>
              ) : (
                <li key={item.group.id} className="space-y-1.5">
                  <p className="text-sm font-medium">
                    <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
                    {item.group.title ?? t('exam.question_group')}
                  </p>
                  <ul className="ml-5 space-y-1.5 border-l border-border pl-3">
                    {(item.group.questions ?? []).map(question => (
                      <li key={question.id}>
                        <QuestionLine question={question} />
                      </li>
                    ))}
                  </ul>
                </li>
              )
            )}
          </ol>
        )}
      </div>
    </PreviewPanelFrame>
  );
}

function QuestionLine({ question, number }: { question: QuestionRead; number?: number }) {
  const t = useTranslations();
  const { icon: Icon, labelKey } = getQuestionTypeInfo(question.questionType);

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon aria-label={t(labelKey)} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">
        {number !== undefined && <span className="mr-1.5 text-muted-foreground">{number}.</span>}
        {question.prompt}
      </p>
    </div>
  );
}
