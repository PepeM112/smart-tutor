'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, type SyntheticEvent, useState } from 'react';

import { type FileTreeFolder, type FileTreeNote } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sdk } from '@/lib/apiClient';
import { displayTitle } from '@/lib/displayTitle';
import { cn } from '@/lib/utils';

import { useFilesTree } from '../context/FilesTreeContext';
import { fileQueryKeys } from '../lib/queryKeys';

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
  const { mutations, onPreview } = useFilesTree();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isFolder = item.kind === 'folder';
  const id = isFolder ? item.folder.id : item.note.id;

  // Delete-preview counts are only for folders, and only needed once the confirm dialog opens.
  // (For a note the query stays disabled, so its key is never used.)
  const { data: previewRes } = useQuery({
    queryKey: fileQueryKeys.folderDeletePreview(id),
    queryFn: () => sdk.foldersDeletePreview({ path: { folder_id: id } }),
    enabled: isFolder && deleteOpen,
  });
  const preview = previewRes?.data;

  const config = isFolder
    ? {
        currentParentId: item.folder.parentId,
        movingFolderId: item.folder.id,
        isMoving: mutations.isMovingFolder,
        move: (targetId: string | null) => mutations.moveFolder({ id, targetFolderId: targetId }),
        deleteTitle: t('files.move_folder_to_trash'),
        deleteDescription: preview
          ? t('files.move_folder_to_trash_confirm', {
              folderCount: preview.folderCount,
              noteCount: preview.noteCount,
            })
          : '…',
        isTrashing: mutations.isTrashingFolder,
        trash: () => mutations.trashFolder(id),
      }
    : {
        currentParentId: item.note.folderId,
        movingFolderId: undefined,
        isMoving: mutations.isMovingNote,
        move: (targetId: string | null) => mutations.moveNote({ id, folderId: targetId }),
        deleteTitle: t('notes.move_to_trash_title'),
        deleteDescription: t('notes.move_to_trash_confirm', { title: displayTitle(item.note.title, t) }),
        isTrashing: mutations.isTrashingNote,
        trash: () => mutations.trashNote(id),
      };

  return (
    <RowEventBoundary>
      <div className={actionsClass(moveOpen || deleteOpen)}>
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
      </div>

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
        confirmLabel={t('files.move_to_trash')}
        disableConfirm={config.isTrashing}
        onConfirm={() => {
          config.trash();
          setDeleteOpen(false);
        }}
      />
    </RowEventBoundary>
  );
}

/**
 * CSS classes for the actions container.
 * Desktop: hidden until the row is hovered/focused or a dialog is open.
 * Mobile (no hover): always visible.
 */
function actionsClass(anyOpen: boolean) {
  return cn(
    'flex w-[116px] shrink-0 items-center justify-end gap-0.5',
    'lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100',
    anyOpen && 'lg:opacity-100'
  );
}

/**
 * Stops events at the actions cell, so they do not reach the row.
 * The dialogs render in a portal, but React still sends their events up the React tree:
 * without this, a click in MoveDialog would also toggle the folder or open the note,
 * and a pointer down or Enter would start a row drag.
 */
function RowEventBoundary({ children }: { children: ReactNode }) {
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <div className="contents" onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      {children}
    </div>
  );
}
