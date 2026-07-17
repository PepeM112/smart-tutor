'use client';

import { useQuery } from '@tanstack/react-query';

import { sdk } from '@/lib/api-client';

import { fromApiToEditorItems } from './converters';
import { TestEditorForm } from './TestEditorForm';

type Props = {
  testId?: string;
};

export function TestEditor({ testId }: Props) {
  const {
    data: existing,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['tests', testId],
    queryFn: () => sdk.testsGet({ path: { test_id: testId! } }),
    enabled: !!testId,
  });

  if (testId && isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  if (testId && isError) {
    return <p className="text-muted-foreground">Failed to load test. Please try again.</p>;
  }

  const test = existing?.data;

  if (testId && !test) {
    return <p className="text-muted-foreground">Test not found.</p>;
  }

  return (
    <TestEditorForm
      testId={testId}
      initialTitle={test?.title}
      initialDescription={test?.description ?? undefined}
      initialItems={test ? fromApiToEditorItems(test.questions, test.questionGroups) : undefined}
    />
  );
}
