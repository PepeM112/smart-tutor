'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { QuickTestDialog } from '@/features/tests/components/quick-test-dialog';
import { TestsTable } from '@/features/tests/components/tests-table';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

export default function TestsPage() {
  useBreadcrumb('Tests');

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
          <Button size="lg" asChild>
            <Link href={Routes.TEST_NEW}>
              <Plus />
              Create Test
            </Link>
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
