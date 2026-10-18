'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { type SpaceSummary } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { courseQueryKeys } from '@/features/courses/lib/queryKeys';
import { ReviewSession } from '@/features/review/components/ReviewSession';
import { REVIEW_BATCH_SIZE, REVIEW_SCOPE_ALL, resolveReviewScope, reviewScopeOptions } from '@/features/review/helpers';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { sdk } from '@/lib/apiClient';

export default function ReviewPage() {
  const t = useTranslations();
  useBreadcrumb(t('review.title'));
  const [mode, setMode] = useState<'review' | 'practice'>('review');
  const [chosenScope, setChosenScope] = useState(REVIEW_SCOPE_ALL);

  // The Courses page uses the same key when its filter shows active courses only. A change of the
  // Review toggle refreshes it, because it is under `courseQueryKeys.mine()`.
  const { data: courses } = useQuery({
    queryKey: courseQueryKeys.mine({ status: 'active' }),
    queryFn: async (): Promise<SpaceSummary[]> =>
      (await sdk.spacesListMine({ query: { status: 'active' }, throwOnError: true })).data,
  });
  const scopeOptions = useMemo(
    () =>
      reviewScopeOptions(courses ?? [], {
        all: t('review.scope_all'),
        personal: t('review.scope_personal'),
      }),
    [courses, t]
  );
  const scope = resolveReviewScope(chosenScope, scopeOptions);

  const {
    data: response,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['review', 'questions', mode, scope],
    queryFn: () => sdk.reviewList({ query: { limit: REVIEW_BATCH_SIZE, mode, scope } }),
  });

  const reviewData = response?.data;
  const questions = reviewData?.questions ?? [];
  // Whether the user has any questions at all — distinguishes "nothing to review" from "nothing exists yet"
  const hasQuestions = reviewData?.hasQuestions ?? false;

  // Only a user with a course in Review needs the select.
  const scopeSelect = scopeOptions.length > 2 && (
    <label className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
      {t('review.scope_label')}
      <NativeSelect className="w-auto" value={scope} onChange={e => setChosenScope(e.target.value)}>
        {scopeOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  return (
    <>
      {scopeSelect}
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
          <ReviewSession key={`${mode}-${scope}`} initialQuestions={questions} mode={mode} scope={scope} />
        )}
      </QueryState>
    </>
  );
}
