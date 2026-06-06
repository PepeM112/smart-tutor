'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, Loader2, PartyPopper } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ReviewSession } from '@/features/review/components/review-session';
import { REVIEW_BATCH_SIZE } from '@/features/review/helpers';
import { sdk } from '@/lib/api-client';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function ReviewPage() {
  const { set, reset } = useBreadcrumbStore();
  const [mode, setMode] = useState<'review' | 'practice'>('review');

  useEffect(() => {
    set('Review Now');
    return () => reset();
  }, [set, reset]);

  const { data: response, isLoading } = useQuery({
    queryKey: ['review', 'questions', mode],
    queryFn: () => sdk.reviewList({ query: { limit: REVIEW_BATCH_SIZE, mode } }),
  });

  const reviewData = response?.data;
  const questions = reviewData?.questions ?? [];
  const hasQuestions = reviewData?.hasQuestions ?? false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (questions.length === 0 && !hasQuestions) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BookOpen className="size-10 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">No questions yet.</p>
        <p className="text-sm text-muted-foreground mt-1">Create some tests with questions first!</p>
      </div>
    );
  }

  if (questions.length === 0 && hasQuestions) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <PartyPopper className="size-10 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">You&apos;re all caught up!</p>
        <p className="text-sm text-muted-foreground mt-1">No questions are due for review right now.</p>
        <Button variant="outline" className="mt-4" onClick={() => setMode('practice')}>
          Practice anyway
        </Button>
      </div>
    );
  }

  return <ReviewSession initialQuestions={questions} mode={mode} />;
}
