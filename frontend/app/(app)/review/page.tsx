'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { ReviewSession } from '@/features/review/components/review-session';
import { REVIEW_BATCH_SIZE } from '@/features/review/helpers';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';

export default function ReviewPage() {
  const t = useTranslations('review');
  useBreadcrumb(t('title'));
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
    <QueryState isLoading={isLoading} isError={isError} errorMessage={t('failed_to_load')}>
      {questions.length === 0 && !hasQuestions ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="size-10 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{t('no_questions')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('create_tests_first')}</p>
        </div>
      ) : questions.length === 0 && hasQuestions ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <PartyPopper className="size-10 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{t('all_caught_up')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('no_questions_due')}</p>
          <Button variant="outline" className="mt-4" onClick={() => setMode('practice')}>
            {t('practice_anyway')}
          </Button>
        </div>
      ) : (
        <ReviewSession initialQuestions={questions} mode={mode} />
      )}
    </QueryState>
  );
}
