'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { ReviewSession } from '@/features/review/components/ReviewSession';
import { REVIEW_BATCH_SIZE } from '@/features/review/helpers';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { sdk } from '@/lib/apiClient';

export default function ReviewPage() {
  const t = useTranslations();
  useBreadcrumb(t('review.title'));
  const [mode, setMode] = useState<'review' | 'practice'>('review');

  const {
    data: response,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['review', 'questions', mode],
    queryFn: () => sdk.reviewList({ query: { limit: REVIEW_BATCH_SIZE, mode } }),
  });

  const reviewData = response?.data;
  const questions = reviewData?.questions ?? [];
  // Whether the user has any questions at all — distinguishes "nothing to review" from "nothing exists yet"
  const hasQuestions = reviewData?.hasQuestions ?? false;

  return (
    <QueryState isLoading={isLoading} isError={isError} errorMessage={t('review.failed_to_load')}>
      {questions.length === 0 && !hasQuestions ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="size-10 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{t('review.no_questions')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('review.create_tests_first')}</p>
        </div>
      ) : questions.length === 0 && hasQuestions ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <PartyPopper className="size-10 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{t('review.all_caught_up')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('review.no_questions_due')}</p>
          <Button variant="outline" className="mt-4" onClick={() => setMode('practice')}>
            {t('review.practice_anyway')}
          </Button>
        </div>
      ) : (
        <ReviewSession initialQuestions={questions} mode={mode} />
      )}
    </QueryState>
  );
}
