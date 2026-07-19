'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { toast } from 'sonner';

import { ExamView } from '@/features/tests/components/exam-view';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function TakeTestPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('tests');

  const {
    data: testResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['tests', id, 'exam'],
    queryFn: () => sdk.testsGetExam({ path: { test_id: id } }),
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
      toast.error(detail ?? t('failed_to_submit'));
    },
  });

  useBreadcrumb(test?.title ?? t('take_test'), [{ label: t('title'), href: Routes.TESTS }], Routes.TESTS);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-muted-foreground">{t('failed_to_load')}</p>;
  }

  if (!test) {
    return <p className="text-muted-foreground">{t('test_not_found')}</p>;
  }

  if ((test.questions?.length ?? 0) === 0 && (test.questionGroups?.length ?? 0) === 0) {
    return <p className="text-muted-foreground">{t('no_questions_yet')}</p>;
  }

  return <ExamView test={test} onSubmit={submitExam} isSubmitting={isSubmitting} result={null} />;
}
