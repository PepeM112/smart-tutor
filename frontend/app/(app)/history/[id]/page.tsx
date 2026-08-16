'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { use } from 'react';

import { QueryState } from '@/components/shared/query-state';
import { ResultDetail } from '@/features/history/components/result-detail';
import { useTestResult } from '@/features/history/hooks/use-test-result';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function ResultDetailPage({ params }: Props) {
  const { id } = use(params);
  const t = useTranslations('history');
  useBreadcrumb(t('test_result'), [{ label: t('title'), href: Routes.HISTORY }], Routes.HISTORY);

  const { data: resultResponse, isLoading: isLoadingResult, isError: isResultError } = useTestResult(id);

  const result = resultResponse?.data;

  const {
    data: testResponse,
    isLoading: isLoadingTest,
    isError: isTestError,
  } = useQuery({
    queryKey: ['tests', result?.testId],
    queryFn: () => sdk.testsGet({ path: { test_id: result!.testId } }),
    enabled: !!result?.testId,
  });

  const test = testResponse?.data;

  return (
    <QueryState
      isLoading={isLoadingResult || isLoadingTest}
      isError={isResultError || isTestError}
      errorMessage={t('failed_to_load_result')}
    >
      {result && test ? (
        <ResultDetail result={result} test={test} />
      ) : (
        <p className="text-muted-foreground">{t('result_not_found')}</p>
      )}
    </QueryState>
  );
}
