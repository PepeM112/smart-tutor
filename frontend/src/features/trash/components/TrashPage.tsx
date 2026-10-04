'use client';

import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { sdk } from '@/lib/apiClient';

import { useTrashMutations } from '../hooks/useTrashMutations';

import { TrashTable } from './TrashTable';

export function TrashPage() {
  const t = useTranslations();
  useBreadcrumb(t('trash.title'));

  const {
    data: res,
    isLoading,
    isError,
  } = useQuery({
    queryKey: fileQueryKeys.trash(),
    queryFn: () => sdk.trashList(),
  });
  const items = res?.data ?? [];

  const { emptyTrash, isEmptying } = useTrashMutations();

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('trash.subtitle')}</p>
        {items.length > 0 && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" icon={Trash2} disabled={isEmptying}>
                {t('trash.empty_trash')}
              </Button>
            }
            title={t('trash.empty_trash_title')}
            description={t('trash.empty_trash_confirm')}
            confirmLabel={t('trash.delete_forever')}
            confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disableConfirm={isEmptying}
            onConfirm={() => emptyTrash()}
          />
        )}
      </div>

      {/* Content */}
      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('trash.failed_to_load')}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Trash2 className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('trash.empty_state')}</p>
          </div>
        ) : (
          <TrashTable items={items} />
        )}
      </QueryState>
    </div>
  );
}
