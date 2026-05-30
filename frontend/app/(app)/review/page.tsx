'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { QuestionRead } from '@/client';
import { ReviewSession } from '@/features/review/components/review-session';
import { REVIEW_BATCH_SIZE } from '@/features/review/helpers';
import { sdk } from '@/lib/api-client';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function ReviewPage() {
  const { set, reset } = useBreadcrumbStore();
  const [questions, setQuestions] = useState<QuestionRead[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    set('Review Now');
    return () => reset();
  }, [set, reset]);

  useEffect(() => {
    async function fetchQuestions() {
      try {
        const { data } = (await sdk.reviewGetReviewQuestions({
          query: { limit: REVIEW_BATCH_SIZE },
        })) as { data: QuestionRead[] };
        setQuestions(data ?? []);
      } catch {
        setQuestions([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchQuestions();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-muted-foreground">No questions available for review.</p>
        <p className="text-sm text-muted-foreground mt-1">Create some tests with questions first!</p>
      </div>
    );
  }

  return <ReviewSession initialQuestions={questions} />;
}
