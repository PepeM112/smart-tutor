'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useEffect } from 'react';
import { toast } from 'sonner';

import { ExamView } from '@/features/tests/components/exam-view';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

type Props = {
  params: Promise<{ id: string }>;
};

export default function TakeTestPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { set, reset } = useBreadcrumbStore();

  const {
    data: testResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['tests', id, 'exam'],
    queryFn: () => sdk.testsGet({ path: { test_id: id }, query: { strip_answers: true } }),
  });

  const test = testResponse?.data;

  const { mutate: submitExam, isPending: isSubmitting } = useMutation({
    mutationFn: (answers: Record<string, string>) =>
      sdk.testsSubmit({
        path: { test_id: id },
        body: {
          answers: Object.entries(answers).map(([questionId, userAnswer]) => ({
            questionId,
            userAnswer,
          })),
        },
      }),
    onSuccess: async response => {
      const resultId = response.data?.id;
      if (!resultId) return;
      await queryClient.invalidateQueries({ queryKey: ['results'] });
      router.push(Routes.RESULT_DETAIL(resultId));
    },
    onError: (err: unknown) => {
      const detail = (err as { detail?: string })?.detail;
      toast.error(detail ?? 'Failed to submit exam. Please try again.');
    },
  });

  useEffect(() => {
    set(test?.title ?? 'Take Test', [{ label: 'Tests', href: Routes.TESTS }], Routes.TESTS);
    return () => reset();
  }, [set, reset, test?.title]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-muted-foreground">Failed to load test. Please try again.</p>;
  }

  if (!test) {
    return <p className="text-muted-foreground">Test not found.</p>;
  }

  if ((test.questions?.length ?? 0) === 0 && (test.questionGroups?.length ?? 0) === 0) {
    return <p className="text-muted-foreground">This test has no questions yet.</p>;
  }

  return <ExamView test={test} onSubmit={submitExam} isSubmitting={isSubmitting} result={null} />;
}
