'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

type Options = {
  /**
   * ID of the folder whose contents are currently shown.
   * Used to narrow folder-contents invalidation so only the visible list refetches.
   */
  currentFolderId: string | null;
  onTrash?: () => void;
  onMove?: () => void;
};

/**
 * Centralises all file-tree mutations (rename, move, trash) used by FileTreeRow,
 * FolderActionsMenu, NoteActionsMenu, and FilesPage toolbar.
 * Each mutation follows the project pattern:
 *   onSuccess → invalidate caches + toast.success
 *   onError   → toast.error via getErrorDetail
 */
export function useFileMutations({ currentFolderId, onTrash, onMove }: Options) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  // ── restore helpers (Undo toasts only) ──────────────────────────────────────

  const { mutate: restoreFolder } = useMutation({
    mutationFn: (id: string) => sdk.trashRestore({ path: { kind: 'folder', item_id: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_restore'))),
  });

  const { mutate: restoreNote } = useMutation({
    mutationFn: (id: string) => sdk.trashRestore({ path: { kind: 'note', item_id: id } }),
    onSuccess: () => {
      // refetchType 'none': the open editor must not be reset by a background refetch.
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_restore'))),
  });

  // ── trash folder ─────────────────────────────────────────────────────────────

  const { mutate: trashFolder, isPending: isTrashingFolder } = useMutation({
    mutationFn: (folderId: string) => sdk.foldersDelete({ path: { folder_id: folderId } }),
    onSuccess: (_, folderId) => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success(t('files.folder_moved_to_trash'), {
        action: { label: t('common.undo'), onClick: () => restoreFolder(folderId) },
      });
      onTrash?.();
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_delete_folder'))),
  });

  // ── trash note ───────────────────────────────────────────────────────────────

  const { mutate: trashNote, isPending: isTrashingNote } = useMutation({
    mutationFn: (noteId: string) => sdk.notesDelete({ path: { note_id: noteId } }),
    onSuccess: (_, noteId) => {
      void queryClient.invalidateQueries({ queryKey: ['folders', 'contents', currentFolderId] });
      // refetchType 'none': do not reset the open note editor while the user is editing.
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success(t('files.note_moved_to_trash'), {
        action: { label: t('common.undo'), onClick: () => restoreNote(noteId) },
      });
      onTrash?.();
    },
    onError: err => toast.error(getErrorDetail(err, t('notes.failed_to_delete'))),
  });

  // ── rename folder ─────────────────────────────────────────────────────────────

  const { mutate: renameFolder, isPending: isRenamingFolder } = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      sdk.foldersUpdate({ path: { folder_id: id }, body: { name } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success(t('files.folder_renamed'));
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_rename_folder'))),
  });

  // ── rename note ───────────────────────────────────────────────────────────────
  // Sends the current version for optimistic-concurrency guard (409 on stale).

  const { mutate: renameNote, isPending: isRenamingNote } = useMutation({
    mutationFn: ({ id, name, version }: { id: string; name: string; version: number }) =>
      sdk.notesUpdate({ path: { note_id: id }, body: { title: name, version } }),
    onSuccess: () => {
      // refetchType 'none': do not overwrite the open note's draft.
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['folders', 'contents'] });
      toast.success(t('files.note_renamed'));
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_rename_note'))),
  });

  // ── move folder ───────────────────────────────────────────────────────────────

  const { mutate: moveFolder, isPending: isMovingFolder } = useMutation({
    mutationFn: ({ id, targetFolderId }: { id: string; targetFolderId: string | null }) =>
      sdk.foldersUpdate({ path: { folder_id: id }, body: { parentId: targetFolderId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success(t('files.moved'));
      onMove?.();
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_move'))),
  });

  // ── move note ─────────────────────────────────────────────────────────────────

  const { mutate: moveNote, isPending: isMovingNote } = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      sdk.notesMove({ path: { note_id: id }, body: { folderId } }),
    onSuccess: res => {
      if (res.data) {
        queryClient.setQueryData(['notes', res.data.id], res);
      }
      void queryClient.invalidateQueries({ queryKey: ['folders', 'contents'] });
      // refetchType 'none': same reason as note trash — don't reset the open editor.
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      toast.success(t('files.note_moved'));
      onMove?.();
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_move_note'))),
  });

  return {
    trashFolder,
    isTrashingFolder,
    trashNote,
    isTrashingNote,
    renameFolder,
    isRenamingFolder,
    renameNote,
    isRenamingNote,
    moveFolder,
    isMovingFolder,
    moveNote,
    isMovingNote,
  };
}
