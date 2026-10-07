'use client';

import { EllipsisVertical, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ActionsMenu } from '@/components/shared/ActionsMenu';
import { RowEventBoundary } from '@/components/shared/tree/RowEventBoundary';
import { TreeActionsCell } from '@/components/shared/tree/TreeActionsCell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import { useTrashTable } from '../context/TrashTableContext';
import { type TrashTarget } from '../hooks/useTrashMutations';
import { TRASH_ACTIONS_CELL_WIDTH_CLASS } from '../lib/constants';

type Props = {
  target: TrashTarget;
  /** Shown in the confirm text of "Delete forever". */
  name: string;
};

/** Hover actions of a Trash row: one `⋮` menu, like a Files row. */
export function TrashRowActions({ target, name }: Props) {
  const t = useTranslations();
  const { restoreItem, hardDeleteItem, isBusy } = useTrashTable();
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The actions cell shows only on hover. Keep it visible while the menu is open.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <RowEventBoundary>
      <TreeActionsCell widthClass={TRASH_ACTIONS_CELL_WIDTH_CLASS} forceVisible={menuOpen || deleteOpen}>
        <ActionsMenu
          actions={[
            [{ label: t('trash.restore'), icon: RotateCcw, disabled: isBusy, onClick: () => restoreItem(target) }],
            [
              {
                label: t('trash.delete_forever'),
                icon: Trash2,
                variant: 'destructive',
                disabled: isBusy,
                onClick: () => setDeleteOpen(true),
              },
            ],
          ]}
          onOpenChange={setMenuOpen}
          trigger={
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('common.action')}>
              <EllipsisVertical className="size-4" />
            </Button>
          }
        />
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
