'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { QuickTestDialog } from '@/features/tests/components/quick-test-dialog';
import { TestsTable } from '@/features/tests/components/tests-table';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

export default function TestsPage() {
  const t = useTranslations('tests');
  useBreadcrumb(t('title'));

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <QuickTestDialog compact />
          <Button size="lg" icon={Plus} asChild>
            <Link href={Routes.TEST_NEW}>{t('create_test')}</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="text-muted-foreground">{t('failed_to_load')}</p>
      ) : (
        <TestsTable data={tests?.data ?? []} />
      )}
    </div>
  );
}
