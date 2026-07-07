'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { use, useEffect } from 'react';

import ResultDetail from '@/features/history/components/result-detail';
import { useTestResult } from '@/features/history/hooks/use-test-result';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

type Props = {
  params: Promise<{ id: string }>;
};

export default function ResultDetailPage({ params }: Props) {
  const { id } = use(params);
  const { set, reset } = useBreadcrumbStore();

  const { data: resultResponse, isLoading: isLoadingResult } = useTestResult(id);

  const result = resultResponse?.data;

  const { data: testResponse, isLoading: isLoadingTest } = useQuery({
    queryKey: ['tests', result?.testId],
    queryFn: () => sdk.testsGet({ path: { test_id: result!.testId } }),
    enabled: !!result?.testId,
  });

  const test = testResponse?.data;

  useEffect(() => {
    set('Test Result', [{ label: 'Test History', href: Routes.HISTORY }], Routes.HISTORY);
    return () => reset();
  }, [set, reset]);

  if (isLoadingResult || isLoadingTest) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!result || !test) {
    return <p className="text-muted-foreground">Test result not found.</p>;
  }

  return <ResultDetail result={result} test={test} />;
}
