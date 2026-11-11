'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { buildTestMentionCandidates, formatTestDetail } from '@/features/assist/utils/formatPageData';
import { sdk } from '@/lib/apiClient';
import { errorStatus } from '@/lib/utils';

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
    error,
  } = useQuery({
    queryKey: ['tests', testId],
    queryFn: () => sdk.testsGet({ path: { test_id: testId! } }),
    enabled: !!testId,
  });

  const test = existing?.data;

  const mentionCandidates = useMemo(() => (test ? buildTestMentionCandidates(test) : []), [test]);
  useProvidePageData(
    useMemo(() => (test ? formatTestDetail(test) : null), [test]),
    mentionCandidates
  );

  if (testId && isLoading) {
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  }

  if (testId && isError) {
    // A typed or stale URL can point to a test that is gone: say so instead of a generic load error.
    const messageKey = errorStatus(error) === 404 ? 'tests.test_not_found' : 'tests.failed_to_load';
    return <p className="text-muted-foreground">{t(messageKey)}</p>;
  }

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
