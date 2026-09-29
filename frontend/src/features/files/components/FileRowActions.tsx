'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, type SyntheticEvent, useState } from 'react';

import { type FileTreeFolder, type FileTreeNote } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sdk } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

import { MoveDialog } from './MoveDialog';

import type { useFileMutations } from '../hooks/useFileMutations';

type Mutations = ReturnType<typeof useFileMutations>;

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

// ─── FolderRowActions ─────────────────────────────────────────────────────────

type FolderRowActionsProps = {
  folder: FileTreeFolder;
  onStartRename: () => void;
  mutations: Mutations;
};

export function FolderRowActions({ folder, onStartRename, mutations }: FolderRowActionsProps) {
  const t = useTranslations();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Fetch delete-preview counts only when the confirm dialog opens.
  const { data: previewRes } = useQuery({
    queryKey: ['folders', folder.id, 'delete-preview'],
    queryFn: () => sdk.foldersDeletePreview({ path: { folder_id: folder.id } }),
    enabled: deleteOpen,
  });
  const preview = previewRes?.data;

  return (
    <RowEventBoundary>
      <div className={actionsClass(moveOpen || deleteOpen)}>
        {/* Empty slot — keeps column widths aligned with note rows */}
        <span className="size-7 shrink-0" />

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
        movingFolderId={folder.id}
        currentParentId={folder.parentId}
        isPending={mutations.isMovingFolder}
        onConfirm={targetFolderId => {
          mutations.moveFolder({ id: folder.id, targetFolderId });
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
        disableConfirm={mutations.isTrashingFolder}
        onConfirm={() => {
          mutations.trashFolder(folder.id);
          setDeleteOpen(false);
        }}
      />
    </RowEventBoundary>
  );
}

// ─── NoteRowActions ───────────────────────────────────────────────────────────

type NoteRowActionsProps = {
  note: FileTreeNote;
  onStartRename: () => void;
  onPreview: (noteId: string) => void;
  mutations: Mutations;
};

export function NoteRowActions({ note, onStartRename, onPreview, mutations }: NoteRowActionsProps) {
  const t = useTranslations();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const title = note.title.trim() || t('notes.untitled');

  return (
    <RowEventBoundary>
      <div className={actionsClass(moveOpen || deleteOpen)}>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('files.preview')}
          aria-label={t('files.preview')}
          onClick={() => onPreview(note.id)}
        >
          <Eye className="size-4" />
        </Button>

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
        currentParentId={note.folderId}
        isPending={mutations.isMovingNote}
        onConfirm={folderId => {
          mutations.moveNote({ id: note.id, folderId });
          setMoveOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trigger={<span />}
        title={t('notes.move_to_trash_title')}
        description={t('notes.move_to_trash_confirm', { title })}
        confirmLabel={t('files.move_to_trash')}
        disableConfirm={mutations.isTrashingNote}
        onConfirm={() => {
          mutations.trashNote(note.id);
          setDeleteOpen(false);
        }}
      />
    </RowEventBoundary>
  );
}
