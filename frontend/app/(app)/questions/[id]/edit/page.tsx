'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { QueryState } from '@/components/shared/QueryState';
import { QuestionForm } from '@/features/questions/components/question-form';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';

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
