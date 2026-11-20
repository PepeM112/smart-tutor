'use client';

import { useMutation } from '@tanstack/react-query';
import { Download, EllipsisVertical, Eye, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { type FileTreeFolder, type FileTreeNote } from '@/client';
import { ActionsMenu, type MobileAction } from '@/components/shared/ActionsMenu';
import { RowEventBoundary } from '@/components/shared/tree/RowEventBoundary';
import { TreeActionsCell } from '@/components/shared/tree/TreeActionsCell';
import { ACTIONS_CELL_TWO_BUTTONS_CLASS } from '@/components/shared/tree/treeLayout';
import { Button } from '@/components/ui/button';
import { exportNote } from '@/features/notes/lib/exportNote';
import { sdk } from '@/lib/apiClient';
import { displayTitle } from '@/lib/displayTitle';
import { getErrorDetail } from '@/lib/utils';

import { useFilesTree } from '../context/FilesTreeContext';
import { hasChildItems } from '../lib/fileTree';

import { MoveDialog } from './MoveDialog';

type FileRowItem = { kind: 'folder'; folder: FileTreeFolder } | { kind: 'note'; note: FileTreeNote };

type Props = {
  item: FileRowItem;
  onStartRename: () => void;
};

/**
 * Hover actions for a folder row or a note row: a note has an Eye (preview) button, both have one `⋮` menu.
 * Preview is a button, not a menu entry, because it is the most used action (same as DataTableV2).
 * The two kinds differ in the first menu group (note: export), the dialog texts and the mutations,
 * so one component reads them from a small config.
 */
export function FileRowActions({ item, onStartRename }: Props) {
  const t = useTranslations();
  const { mutations, onPreview, childrenIndex } = useFilesTree();
  const [moveOpen, setMoveOpen] = useState(false);
  // Focus target after the Move dialog closes. The dialog has no trigger of its own.
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  // The actions cell shows only on hover. Keep it visible while the menu is open.
  const [menuOpen, setMenuOpen] = useState(false);

  const { mutate: downloadNote } = useMutation({
    mutationFn: (noteId: string) => sdk.notesGet({ path: { note_id: noteId } }),
    onSuccess: res => {
      if (!res.data) return;
      exportNote(displayTitle(res.data.title, t), res.data.content ?? '');
      toast.success(t('common.downloaded'));
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_export'))),
  });

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

  const manageActions: MobileAction[] = [
    { label: t('files.rename'), icon: Pencil, onClick: onStartRename },
    { label: t('files.move'), icon: FolderInput, onClick: () => setMoveOpen(true) },
  ];
  const deleteActions: MobileAction[] = [
    {
      label: config.deleteConfirmLabel,
      icon: Trash2,
      variant: 'destructive',
      // The menu blocks a second click while the request runs (the old dialog disabled its confirm button).
      disabled: config.isTrashing,
      onClick: config.trash,
      confirm: { title: config.deleteTitle, description: config.deleteDescription },
    },
  ];
  const noteActions: MobileAction[] = [{ label: t('common.export'), icon: Download, onClick: () => downloadNote(id) }];

  return (
    <RowEventBoundary>
      <TreeActionsCell widthClass={ACTIONS_CELL_TWO_BUTTONS_CLASS} forceVisible={menuOpen || moveOpen}>
        {!isFolder && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            tooltip={t('common.preview')}
            aria-label={t('common.preview')}
            onClick={() => onPreview(id)}
          >
            <Eye className="size-4" />
          </Button>
        )}
        <ActionsMenu
          actions={isFolder ? [manageActions, deleteActions] : [noteActions, manageActions, deleteActions]}
          onOpenChange={setMenuOpen}
          trigger={
            <Button
              ref={menuTriggerRef}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={t('common.action')}
            >
              <EllipsisVertical className="size-4" />
            </Button>
          }
        />
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
        onCloseAutoFocus={event => {
          event.preventDefault();
          menuTriggerRef.current?.focus();
        }}
      />
    </RowEventBoundary>
  );
}
