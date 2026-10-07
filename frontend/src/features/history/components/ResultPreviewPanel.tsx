'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { AnswerStatus, type AnswerRead, type QuestionRead, QuestionType } from '@/client';
import { PreviewPanelFrame } from '@/components/shared/PreviewPanelFrame';
import { QueryState } from '@/components/shared/QueryState';
import { sdk } from '@/lib/apiClient';
import { Routes } from '@/lib/routes';

import { useTestResult } from '../hooks/useTestResult';

import { MultipleChoiceReview } from './MultipleChoiceReview';
import { CompactGroupCard, CompactQuestionCard } from './QuestionReviewCards';
import { buildExamItems, countCorrectInGroup, ExamItemType, getUserAnswerDisplay } from './resultDetailUtils';
import { ScoreBanner } from './ScoreBanner';

type Props = {
  resultId: string;
  onClose: () => void;
};

const LONG_TEXT_PREVIEW_CHARS = 300;

/**
 * Read-only preview of a test result: the score and one card per question with the answer of the
 * user under it. It loads the result and the test version like the detail page (2 calls, same keys).
 * No selection and no challenge actions: those are on the full page.
 */
export function ResultPreviewPanel({ resultId, onClose }: Props) {
  const t = useTranslations();

  // Polls while answers are pending, like the detail page.
  const { data: resultRes, isLoading: isLoadingResult, isError: isResultError } = useTestResult(resultId);
  const result = resultRes?.data;

  const {
    data: testRes,
    isLoading: isLoadingTest,
    isError: isTestError,
  } = useQuery({
    queryKey: ['tests', result?.testId],
    queryFn: () => sdk.testsGet({ path: { test_id: result!.testId } }),
    enabled: !!result?.testId,
  });
  const test = testRes?.data;

  const items = useMemo(() => (test ? buildExamItems(test) : []), [test]);
  const answerMap = useMemo(
    () => new Map<string, AnswerRead>((result?.answers ?? []).map(answer => [answer.questionId, answer])),
    [result?.answers]
  );

  return (
    <PreviewPanelFrame
      title={test?.title}
      openHref={Routes.RESULT_DETAIL(resultId)}
      onClose={onClose}
      contentKey={resultId}
    >
      <QueryState
        isLoading={isLoadingResult || isLoadingTest}
        isError={isResultError || isTestError}
        errorMessage={t('history.failed_to_load_result')}
      >
        {result && test ? (
          <div className="space-y-4">
            <ScoreBanner result={result} testTitle={test.title} isOlderVersion={!!test.parentId} />
            {items.map((item, index) =>
              item.type === ExamItemType.QUESTION ? (
                <div key={item.question.id} className="space-y-2">
                  <CompactQuestionCard
                    question={item.question}
                    answer={answerMap.get(item.question.id)}
                    number={index + 1}
                    isSelected={false}
                  />
                  <AnswerSummary question={item.question} answer={answerMap.get(item.question.id)} />
                </div>
              ) : (
                <div key={item.group.id} className="space-y-2">
                  <CompactGroupCard
                    title={item.group.title ?? t('exam.question_group')}
                    correctCount={countCorrectInGroup(item.group.questions ?? [], answerMap)}
                    totalCount={(item.group.questions ?? []).length}
                    number={index + 1}
                    isSelected={false}
                  />
                  <div className="ml-4 space-y-3 border-l border-border pl-3">
                    {(item.group.questions ?? []).map(question => (
                      <div key={question.id} className="space-y-1">
                        <p className="text-sm font-medium">{question.prompt}</p>
                        <AnswerSummary question={question} answer={answerMap.get(question.id)} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{t('history.result_not_found')}</p>
        )}
      </QueryState>
    </PreviewPanelFrame>
  );
}

/** The answer of the user in a short, read-only form. */
function AnswerSummary({ question, answer }: { question: QuestionRead; answer?: AnswerRead }) {
  const t = useTranslations();

  if (!answer) return <p className="text-sm text-muted-foreground">{t('history.no_answer')}</p>;

  if (answer.status === AnswerStatus.PENDING) {
    return <p className="text-sm text-muted-foreground">{t('history.pending_ai_review')}</p>;
  }

  if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
    return <MultipleChoiceReview question={question} userAnswer={answer.userAnswer} />;
  }

  if (question.questionType === QuestionType.LONG_TEXT) {
    const text = answer.userAnswer.slice(0, LONG_TEXT_PREVIEW_CHARS);
    const isCut = answer.userAnswer.length > LONG_TEXT_PREVIEW_CHARS;
    return (
      <p className="line-clamp-4 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
        {text}
        {isCut && '…'}
      </p>
    );
  }

  return (
    <p className="rounded-md bg-muted/50 p-3 text-sm">
      {getUserAnswerDisplay(question, answer.userAnswer) || t('history.no_answer')}
    </p>
  );
}
