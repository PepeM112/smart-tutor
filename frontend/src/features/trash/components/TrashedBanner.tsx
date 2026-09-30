'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Props = {
  /** Translated text that says what is in Trash, e.g. "This note is in Trash." */
  message: string;
  /** Name of the item, shown in the "delete forever" confirmation. */
  itemName: string;
  onRestore: () => void;
  onDelete: () => void;
  isRestoring: boolean;
  isDeleting: boolean;
};

/** Banner for the page of an item that is in Trash: restore it, or delete it forever. */
export function TrashedBanner({ message, itemName, onRestore, onDelete, isRestoring, isDeleting }: Props) {
  const t = useTranslations('trash');
  const isBusy = isRestoring || isDeleting;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm">
      <Trash2 className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-48 flex-1 text-foreground">{message}</span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={onRestore} disabled={isBusy}>
          {t('restore')}
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={isBusy}>
              {t('delete_forever')}
            </Button>
          }
          title={t('delete_forever_title')}
          description={t('delete_forever_confirm', { name: itemName })}
          confirmLabel={t('delete_forever')}
          confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disableConfirm={isDeleting}
          onConfirm={onDelete}
        />
      </div>
    </div>
  );
}
