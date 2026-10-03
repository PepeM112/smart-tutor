'use client';

import { RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RowEventBoundary } from '@/features/files/components/RowEventBoundary';
import { TreeActionsCell } from '@/features/files/components/TreeActionsCell';
import { TRASH_ACTIONS_CELL_WIDTH_CLASS } from '@/features/files/lib/treeLayout';

import { useTrashTable } from '../context/TrashTableContext';
import { type TrashTarget } from '../hooks/useTrashMutations';

type Props = {
  target: TrashTarget;
  /** Shown in the confirm text of "Delete forever". */
  name: string;
};

/** Hover actions of a Trash row, shown like the actions of a Files row. */
export function TrashRowActions({ target, name }: Props) {
  const t = useTranslations();
  const { restoreItem, hardDeleteItem, isBusy } = useTrashTable();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <RowEventBoundary>
      <TreeActionsCell widthClass={TRASH_ACTIONS_CELL_WIDTH_CLASS} forceVisible={deleteOpen}>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('trash.restore')}
          aria-label={t('trash.restore')}
          disabled={isBusy}
          onClick={() => restoreItem(target)}
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('trash.delete_forever')}
          aria-label={t('trash.delete_forever')}
          disabled={isBusy}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </TreeActionsCell>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('trash.delete_forever_title')}
        description={t('trash.delete_forever_confirm', { name })}
        confirmLabel={t('trash.delete_forever')}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        disableConfirm={isBusy}
        onConfirm={() => {
          hardDeleteItem(target);
          setDeleteOpen(false);
        }}
      />
    </RowEventBoundary>
  );
}
