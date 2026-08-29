'use client';

import { useTranslations } from 'next-intl';

import { QuestionForm } from '@/features/questions/components/QuestionForm';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

export default function NewQuestionPage() {
  const t = useTranslations();
  useBreadcrumb(t('questions.new_question'));

  return (
    <div className="space-y-6">
      <QuestionForm />
    </div>
  );
}
