'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { use } from 'react';

import ResultDetail from '@/features/history/components/result-detail';
import { useTestResult } from '@/features/history/hooks/use-test-result';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function ResultDetailPage({ params }: Props) {
  const { id } = use(params);
  useBreadcrumb('Test Result', [{ label: 'Test History', href: Routes.HISTORY }], Routes.HISTORY);

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

  if (isLoadingResult || isLoadingTest) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isResultError || isTestError) {
    return <p className="text-muted-foreground">Failed to load test result. Please try again.</p>;
  }

  if (!result || !test) {
    return <p className="text-muted-foreground">Test result not found.</p>;
  }

  return <ResultDetail result={result} test={test} />;
}
