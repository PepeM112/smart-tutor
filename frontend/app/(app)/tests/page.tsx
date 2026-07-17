'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { QuickTestDialog } from '@/features/tests/components/quick-test-dialog';
import { TestsTable } from '@/features/tests/components/tests-table';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function TestsPage() {
  const { set, reset } = useBreadcrumbStore();
  const router = useRouter();

  useEffect(() => {
    set('Tests');
    return () => reset();
  }, [set, reset]);

  const {
    data: tests,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['tests'],
    queryFn: () => sdk.testsList(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <p className="text-muted-foreground">Create and manage your question sets here.</p>
        <div className="flex items-center gap-2">
          <QuickTestDialog />
          <Button size="lg" icon={Plus} onClick={() => router.push(Routes.TEST_NEW)}>
            Create Test
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="text-muted-foreground">Failed to load tests. Please try again.</p>
      ) : (
        <TestsTable data={tests?.data ?? []} />
      )}
    </div>
  );
}
