'use client';

import { useTranslations } from 'next-intl';
import { use, useMemo } from 'react';

import { QueryState } from '@/components/shared/QueryState';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { formatResultDetail } from '@/features/assist/utils/formatPageData';
import { ResultDetail } from '@/features/history/components/ResultDetail';
import { useResultTest } from '@/features/history/hooks/useResultTest';
import { useTestResult } from '@/features/history/hooks/useTestResult';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function ResultDetailPage({ params }: Props) {
  const { id } = use(params);
  const t = useTranslations();
  useBreadcrumb(t('history.test_result'), [{ label: t('history.title'), href: Routes.HISTORY }], Routes.HISTORY);

  const { data: resultResponse, isLoading: isLoadingResult, isError: isResultError } = useTestResult(id);

  const result = resultResponse?.data;

  useProvidePageData(
    useMemo(
      () =>
        result
          ? formatResultDetail({
              id: result.id,
              testId: result.testId,
              totalQuestions: result.totalQuestions,
              correctAnswers: result.correctAnswers,
              earnedPoints: result.earnedPoints ?? undefined,
              totalPoints: result.totalPoints ?? undefined,
              createdAt: result.createdAt,
            })
          : null,
      [result]
    )
  );

  const { data: testResponse, isLoading: isLoadingTest, isError: isTestError } = useResultTest(id);

  const test = testResponse?.data;

  return (
    <QueryState
      // h-full: ResultDetail fills the height of the layout.
      className="h-full"
      isLoading={isLoadingResult || isLoadingTest}
      isError={isResultError || isTestError}
      errorMessage={t('history.failed_to_load_result')}
    >
      {result && test ? (
        <ResultDetail result={result} test={test} />
      ) : (
        <p className="text-muted-foreground">{t('history.result_not_found')}</p>
      )}
    </QueryState>
  );
}
