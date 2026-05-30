'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { TestResultRead } from '@/client';
import { ExamView } from '@/features/tests/components/exam-view';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

type Props = {
  params: Promise<{ id: string }>;
};

export default function TakeTestPage({ params }: Props) {
  const { id } = use(params);
  const { set, reset } = useBreadcrumbStore();
  const [result, setResult] = useState<TestResultRead | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: testResponse, isLoading } = useQuery({
    queryKey: ['tests', id, 'exam'],
    queryFn: () => sdk.testsGet({ path: { test_id: id }, query: { strip_answers: true } }),
  });

  const test = testResponse?.data;

  useEffect(() => {
    set(test?.title ?? 'Take Test', [{ label: 'Tests', href: Routes.TESTS }], Routes.TESTS);
    return () => reset();
  }, [set, reset, test?.title]);

  const handleSubmit = useCallback(
    async (answers: Record<string, string>) => {
      setIsSubmitting(true);
      try {
        const response = await sdk.testsSubmit({
          path: { test_id: id },
          body: {
            answers: Object.entries(answers).map(([questionId, userAnswer]) => ({
              questionId,
              userAnswer,
            })),
          },
        });
        setResult(response.data as TestResultRead);
      } catch {
        toast.error('Failed to submit exam. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [id]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!test) {
    return <p className="text-muted-foreground">Test not found.</p>;
  }

  if ((test.questions?.length ?? 0) === 0 && (test.questionGroups?.length ?? 0) === 0) {
    return <p className="text-muted-foreground">This test has no questions yet.</p>;
  }

  return <ExamView test={test} onSubmit={handleSubmit} isSubmitting={isSubmitting} result={result} />;
}
