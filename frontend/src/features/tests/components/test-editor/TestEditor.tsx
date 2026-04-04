'use client';

import { useQuery } from '@tanstack/react-query';

import { sdk } from '@/lib/api-client';

import { fromApiToEditorItems } from './converters';
import { TestEditorForm } from './TestEditorForm';

type Props = {
  testId?: string;
};

export function TestEditor({ testId }: Props) {
  const { data: existing, isLoading } = useQuery({
    queryKey: ['tests', testId],
    queryFn: () => sdk.testsGet({ path: { test_id: testId! } }),
    enabled: !!testId,
  });

  if (testId && isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const test = existing?.data;

  return (
    <TestEditorForm
      testId={testId}
      initialTitle={test?.title}
      initialDescription={test?.description ?? undefined}
      initialItems={test ? fromApiToEditorItems(test.questions, test.questionGroups) : undefined}
    />
  );
}
