'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { QueryState } from '@/components/shared/QueryState';
import { QuestionForm } from '@/features/questions/components/QuestionForm';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { sdk } from '@/lib/apiClient';

export default function EditQuestionPage() {
  const t = useTranslations();
  useBreadcrumb(t('questions.edit_question'));
  const params = useParams<{ id: string }>();

  const {
    data: question,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['questions', params.id],
    queryFn: () => sdk.questionsGet({ path: { question_id: params.id } }),
  });

  return (
    <QueryState isLoading={isLoading} isError={isError || !question?.data} errorMessage={t('questions.failed_to_load')}>
      <div className="space-y-6">{question?.data && <QuestionForm question={question.data} />}</div>
    </QueryState>
  );
}
