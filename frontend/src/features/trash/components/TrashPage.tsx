'use client';

import { useQuery } from '@tanstack/react-query';
import { Folder, NotepadText, Trash2 } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';

import { type TrashItemRead } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { sdk } from '@/lib/apiClient';

import { useTrashMutations } from '../hooks/useTrashMutations';

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
          <div className="space-y-1">
            {items.map(item => (
              <TrashItem key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}

// ─── TrashItem ────────────────────────────────────────────────────────────────

type TrashItemProps = {
  item: TrashItemRead;
};

function TrashItem({ item }: TrashItemProps) {
  const t = useTranslations();
  const { restoreItem, isRestoring, hardDeleteItem, isHardDeleting } = useTrashMutations();
  const target = { kind: item.kind, id: item.id };

  const format = useFormatter();
  // Explicit `now` (updates each minute): without it next-intl warns, and server and client can disagree.
  const now = useNow({ updateInterval: 60_000 });
  const Icon = item.kind === 'folder' ? Folder : NotepadText;
  // next-intl gives a localized relative time ("3 days ago" / "hace 3 días").
  const subtitle = buildSubtitle(item, format.relativeTime(new Date(item.deletedAt), now), t);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-card">
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{item.name}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => restoreItem(target)}
          disabled={isRestoring || isHardDeleting}
        >
          {t('trash.restore')}
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" disabled={isRestoring || isHardDeleting}>
              {t('trash.delete_forever')}
            </Button>
          }
          title={t('trash.delete_forever_title')}
          description={t('trash.delete_forever_confirm', { name: item.name })}
          confirmLabel={t('trash.delete_forever')}
          confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disableConfirm={isHardDeleting}
          onConfirm={() => hardDeleteItem(target)}
        />
      </div>
    </div>
  );
}

function buildSubtitle(item: TrashItemRead, deleted: string, t: ReturnType<typeof useTranslations>): string {
  if (item.kind === 'folder') {
    return `${t('trash.deleted_ago', { time: deleted })} · ${t('trash.folder_contents', { notes: item.noteCount, folders: item.folderCount })}`;
  }
  return t('trash.deleted_ago', { time: deleted });
}
