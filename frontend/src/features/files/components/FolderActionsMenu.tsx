'use client';

import { useQuery } from '@tanstack/react-query';
import { Folder, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type FolderRead } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sdk } from '@/lib/apiClient';

import { MoveDialog } from './MoveDialog';
import { ROW_ACTION_CLASS } from './rowActions';

type Props = {
  folder: FolderRead;
  /** Starts inline rename in the row instead of opening a dialog. */
  onStartRename: () => void;
  onTrash: (folderId: string) => void;
  isTrashingFolder?: boolean;
  moveFolder: (args: { id: string; targetFolderId: string | null }) => void;
  isMovingFolder: boolean;
};

export function FolderActionsMenu({
  folder,
  onStartRename,
  onTrash,
  isTrashingFolder,
  moveFolder,
  isMovingFolder,
}: Props) {
  const t = useTranslations();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: previewRes } = useQuery({
    queryKey: ['folders', folder.id, 'delete-preview'],
    queryFn: () => sdk.foldersDeletePreview({ path: { folder_id: folder.id } }),
    // Only fetch the preview counts when the confirm dialog opens.
    enabled: deleteOpen,
  });
  const preview = previewRes?.data;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('files.item_actions')} className={ROW_ACTION_CLASS}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onStartRename}>
            <Pencil className="size-4 mr-2" />
            {t('files.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoveOpen(true)}>
            <Folder className="size-4 mr-2" />
            {t('files.move')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4 mr-2" />
            {t('files.move_to_trash')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MoveDialog
        open={moveOpen}
        onOpenChange={open => {
          setMoveOpen(open);
        }}
        movingFolderId={folder.id}
        currentParentId={folder.parentId}
        isPending={isMovingFolder}
        onConfirm={targetFolderId => {
          moveFolder({ id: folder.id, targetFolderId });
          setMoveOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trigger={<span />}
        title={t('files.move_folder_to_trash')}
        description={
          preview
            ? t('files.move_folder_to_trash_confirm', {
                folderCount: preview.folderCount,
                noteCount: preview.noteCount,
              })
            : '…'
        }
        confirmLabel={t('files.move_to_trash')}
        disableConfirm={isTrashingFolder}
        onConfirm={() => {
          onTrash(folder.id);
          setDeleteOpen(false);
        }}
      />
    </>
  );
}
