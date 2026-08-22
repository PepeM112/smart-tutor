'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { sdk } from '@/lib/api-client';

import { fromApiToEditorItems } from './converters';
import { TestEditorForm } from './TestEditorForm';

type Props = {
  testId?: string;
};

export function TestEditor({ testId }: Props) {
  const t = useTranslations();
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
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  }

  if (testId && isError) {
    return <p className="text-muted-foreground">{t('tests.failed_to_load')}</p>;
  }

  const test = existing?.data;

  if (testId && !test) {
    return <p className="text-muted-foreground">{t('tests.test_not_found')}</p>;
  }

  return (
    <TestEditorForm
      key={test ? `${test.id}-${test.version}` : 'new'}
      testId={testId}
      initialTitle={test?.title}
      initialDescription={test?.description ?? undefined}
      initialItems={test ? fromApiToEditorItems(test.questions, test.questionGroups) : undefined}
    />
  );
}
