'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

import { ReviewSession } from '@/features/review/components/review-session';
import { REVIEW_BATCH_SIZE } from '@/features/review/helpers';
import { sdk } from '@/lib/api-client';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function ReviewPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Review Now');
    return () => reset();
  }, [set, reset]);

  const { data: response, isLoading } = useQuery({
    queryKey: ['review', 'questions'],
    queryFn: () => sdk.reviewList({ query: { limit: REVIEW_BATCH_SIZE } }),
  });

  const questions = response?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-muted-foreground">No questions available for review.</p>
        <p className="text-sm text-muted-foreground mt-1">Create some tests with questions first!</p>
      </div>
    );
  }

  return <ReviewSession initialQuestions={questions} />;
}
