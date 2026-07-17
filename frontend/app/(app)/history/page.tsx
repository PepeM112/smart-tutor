'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { HistoryTable } from '@/features/history/components/history-table';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';

export default function HistoryPage() {
  useBreadcrumb('Test History');

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
        <p className="text-muted-foreground">A chronological log of your past sessions.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="text-muted-foreground">Failed to load results. Please try again.</p>
      ) : (
        <HistoryTable data={results?.data ?? []} />
      )}
    </div>
  );
}
