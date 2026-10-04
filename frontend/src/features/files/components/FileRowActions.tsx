'use client';

import { Eye, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type FileTreeFolder, type FileTreeNote } from '@/client';
import { RowEventBoundary } from '@/components/shared/tree/RowEventBoundary';
import { TreeActionsCell } from '@/components/shared/tree/TreeActionsCell';
import { ACTIONS_CELL_WIDTH_CLASS } from '@/components/shared/tree/treeLayout';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { displayTitle } from '@/lib/displayTitle';

import { useFilesTree } from '../context/FilesTreeContext';
import { hasChildItems } from '../lib/fileTree';

import { MoveDialog } from './MoveDialog';

type FileRowItem = { kind: 'folder'; folder: FileTreeFolder } | { kind: 'note'; note: FileTreeNote };

type Props = {
  item: FileRowItem;
  onStartRename: () => void;
};

/**
 * Hover actions for a folder row or a note row. The two kinds differ only in
 * the first button (note: preview, folder: an empty slot), the dialog texts and
 * the mutations, so one component reads them from a small config.
 */
export function FileRowActions({ item, onStartRename }: Props) {
  const t = useTranslations();
  const { mutations, onPreview, childrenIndex } = useFilesTree();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isFolder = item.kind === 'folder';
  const id = isFolder ? item.folder.id : item.note.id;

  // Decided from the tree on the client, so the dialog text is final when it opens (no fetch, no flicker).
  // An empty folder is deleted forever by the server; a folder with content goes to Trash.
  const isEmptyFolder = isFolder && !hasChildItems(childrenIndex, id);

  const config = isFolder
    ? {
        currentParentId: item.folder.parentId,
        movingFolderId: item.folder.id,
        isMoving: mutations.isMovingFolder,
        move: (targetId: string | null) => mutations.moveFolder({ id, targetFolderId: targetId }),
        deleteTitle: isEmptyFolder ? t('files.delete_folder') : t('files.move_folder_to_trash'),
        deleteConfirmLabel: isEmptyFolder ? t('common.delete') : t('files.move_to_trash'),
        deleteDescription: isEmptyFolder
          ? t('files.delete_folder_permanently_confirm')
          : t('files.move_folder_to_trash_confirm'),
        isTrashing: mutations.isTrashingFolder,
        trash: () => mutations.trashFolder({ id, name: item.folder.name, parentId: item.folder.parentId }),
      }
    : {
        currentParentId: item.note.folderId,
        movingFolderId: undefined,
        isMoving: mutations.isMovingNote,
        move: (targetId: string | null) => mutations.moveNote({ id, folderId: targetId }),
        deleteTitle: t('files.move_to_trash'),
        deleteConfirmLabel: t('files.move_to_trash'),
        deleteDescription: t('notes.move_to_trash_confirm', { title: displayTitle(item.note.title, t) }),
        isTrashing: mutations.isTrashingNote,
        trash: () => mutations.trashNote(id),
      };

  return (
    <RowEventBoundary>
      <TreeActionsCell widthClass={ACTIONS_CELL_WIDTH_CLASS} forceVisible={moveOpen || deleteOpen}>
        {item.kind === 'note' ? (
          <Button
            variant="ghost"
            size="icon-sm"
            tooltip={t('files.preview')}
            aria-label={t('files.preview')}
            onClick={() => onPreview(id)}
          >
            <Eye className="size-4" />
          </Button>
        ) : (
          // Empty slot — keeps column widths aligned with note rows
          <span className="size-7 shrink-0" />
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('files.move')}
          aria-label={t('files.move')}
          onClick={() => setMoveOpen(true)}
        >
          <FolderInput className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('files.rename')}
          aria-label={t('files.rename')}
          onClick={() => onStartRename()}
        >
          <Pencil className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('files.move_to_trash')}
          aria-label={t('files.move_to_trash')}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </TreeActionsCell>

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        movingFolderId={config.movingFolderId}
        currentParentId={config.currentParentId}
        isPending={config.isMoving}
        onConfirm={targetId => {
          config.move(targetId);
          setMoveOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={config.deleteTitle}
        description={config.deleteDescription}
        confirmLabel={config.deleteConfirmLabel}
        disableConfirm={config.isTrashing}
        onConfirm={() => {
          config.trash();
          setDeleteOpen(false);
        }}
      />
    </RowEventBoundary>
  );
}
