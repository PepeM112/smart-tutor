'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { QuestionForm } from '@/features/questions/components/question-form';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';

export default function EditQuestionPage() {
  const t = useTranslations('questions');
  useBreadcrumb(t('edit_question'));
  const params = useParams<{ id: string }>();

  const {
    data: question,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['questions', params.id],
    queryFn: () => sdk.questionsGet({ path: { question_id: params.id } }),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !question?.data) return <p className="text-muted-foreground">{t('failed_to_load')}</p>;

  return (
    <div className="space-y-6">
      <QuestionForm question={question.data} />
    </div>
  );
}
