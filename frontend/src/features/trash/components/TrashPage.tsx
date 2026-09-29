'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder, NotepadText, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type TrashItemRead } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fileQueryKeys, invalidateAfterFileChange } from '@/features/files/lib/queryKeys';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

export function TrashPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  useBreadcrumb(t('trash.title'));

  const { data: res, isLoading } = useQuery({
    queryKey: fileQueryKeys.trash(),
    queryFn: () => sdk.trashList(),
  });
  const items = res?.data ?? [];

  const { mutate: emptyTrash, isPending: isEmptying } = useMutation({
    mutationFn: () => sdk.trashEmpty(),
    onSuccess: () => {
      invalidateAfterFileChange(queryClient, { trash: true, notes: true });
      toast.success(t('trash.emptied'));
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_empty'))),
  });

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
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : items.length === 0 ? (
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
    </div>
  );
}

// ─── TrashItem ────────────────────────────────────────────────────────────────

type TrashItemProps = {
  item: TrashItemRead;
};

function TrashItem({ item }: TrashItemProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { mutate: restore, isPending: isRestoring } = useMutation({
    mutationFn: () => sdk.trashRestore({ path: { kind: item.kind, item_id: item.id } }),
    onSuccess: () => {
      invalidateAfterFileChange(queryClient, { trash: true, notes: true });
      toast.success(t('trash.restored'));
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_restore'))),
  });

  const { mutate: hardDelete, isPending: isDeleting } = useMutation({
    mutationFn: () => sdk.trashHardDelete({ path: { kind: item.kind, item_id: item.id } }),
    onSuccess: () => {
      invalidateAfterFileChange(queryClient, { trash: true, notes: true });
      toast.success(t('trash.deleted_forever'));
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_delete'))),
  });

  const format = useFormatter();
  const Icon = item.kind === 'folder' ? Folder : NotepadText;
  // next-intl gives a localized relative time ("3 days ago" / "hace 3 días").
  const subtitle = buildSubtitle(item, format.relativeTime(new Date(item.deletedAt)), t);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-foreground/10 bg-card">
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{item.name}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => restore()} disabled={isRestoring || isDeleting}>
          {t('trash.restore')}
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" disabled={isRestoring || isDeleting}>
              {t('trash.delete_forever')}
            </Button>
          }
          title={t('trash.delete_forever_title')}
          description={t('trash.delete_forever_confirm', { name: item.name })}
          confirmLabel={t('trash.delete_forever')}
          confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disableConfirm={isDeleting}
          onConfirm={() => hardDelete()}
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
