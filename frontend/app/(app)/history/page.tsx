'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { HistoryTable } from '@/features/history/components/history-table';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';

export default function HistoryPage() {
  const t = useTranslations('history');
  useBreadcrumb(t('title'));

  const {
    data: results,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['results'],
    queryFn: () => sdk.resultsList(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <p className="text-muted-foreground">{t('failed_to_load')}</p>
      ) : (
        <HistoryTable data={results?.data ?? []} />
      )}
    </div>
  );
}
