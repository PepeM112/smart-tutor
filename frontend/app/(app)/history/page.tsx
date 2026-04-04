'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

import { HistoryTable } from '@/features/history/components/history-table';
import { sdk } from '@/lib/api-client';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function HistoryPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Test History');
    return () => reset();
  }, [set, reset]);

  const { data: results, isLoading } = useQuery({
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
      ) : (
        <HistoryTable data={results?.data ?? []} />
      )}
    </div>
  );
}
