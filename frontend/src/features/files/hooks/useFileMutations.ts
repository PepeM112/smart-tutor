'use client';

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { FileTree } from '@/client';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { moveInTree } from '../lib/fileTree';

type Options = {
  onTrash?: () => void;
  onMove?: () => void;
};

/**
 * Centralises all file-tree mutations (rename, move, trash) used by FileTreeRow,
 * FileRowActions, and FilesPage toolbar.
 *
 * Invalidation strategy: all mutations invalidate `['folders', 'tree']` (the
 * full-tree endpoint), which is under the `['folders']` prefix and replaces the
 * old per-folder `['folders', 'contents', id]` keys.
 *
 * moveNote / moveFolder also do an optimistic update of the cached tree so the
 * UI responds immediately (DnD and MoveDialog). On error the snapshot is restored.
 */
export function useFileMutations({ onTrash, onMove }: Options = {}) {
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
      void queryClient.invalidateQueries({ queryKey: ['folders', 'tree'] });
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
  // FileTreeNote does not include `version`, so we fetch it from the notes cache
  // (or from the server if not cached) before sending the update.
  // This satisfies the optimistic-concurrency guard (409 on stale) without
  // requiring callers to track the version themselves.

  const { mutate: renameNote, isPending: isRenamingNote } = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      // Fetch the latest version before updating — FileTreeNote does not carry it.
      // staleTime: 0 ensures we always get a fresh value, avoiding 409 on stale cache.
      const noteRes = await queryClient.query(
        queryOptions({
          queryKey: ['notes', id] as const,
          queryFn: () => sdk.notesGet({ path: { note_id: id } }),
          staleTime: 0,
        })
      );
      const version = noteRes.data!.version;
      return sdk.notesUpdate({ path: { note_id: id }, body: { title: name, version } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['folders', 'tree'] });
      toast.success(t('files.note_renamed'));
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_rename_note'))),
  });

  // ── move folder ───────────────────────────────────────────────────────────────
  // Optimistic: update the cached FileTree immediately and roll back on error.

  const { mutate: moveFolder, isPending: isMovingFolder } = useMutation({
    mutationFn: ({ id, targetFolderId }: { id: string; targetFolderId: string | null }) =>
      sdk.foldersUpdate({ path: { folder_id: id }, body: { parentId: targetFolderId } }),

    onMutate: async ({ id, targetFolderId }) => {
      await queryClient.cancelQueries({ queryKey: ['folders', 'tree'] });
      const snapshot = queryClient.getQueryData<{ data?: FileTree }>(['folders', 'tree']);
      queryClient.setQueryData<{ data?: FileTree }>(['folders', 'tree'], prev => {
        if (!prev?.data) return prev;
        return { ...prev, data: moveInTree(prev.data, { kind: 'folder', id }, targetFolderId) };
      });
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(['folders', 'tree'], ctx.snapshot);
      toast.error(getErrorDetail(err, t('files.failed_to_move')));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders', 'tree'] });
    },
    onSuccess: () => {
      toast.success(t('files.moved'));
      onMove?.();
    },
  });

  // ── move note ─────────────────────────────────────────────────────────────────
  // Optimistic: same pattern as moveFolder.

  const { mutate: moveNote, isPending: isMovingNote } = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      sdk.notesMove({ path: { note_id: id }, body: { folderId } }),

    onMutate: async ({ id, folderId }) => {
      await queryClient.cancelQueries({ queryKey: ['folders', 'tree'] });
      const snapshot = queryClient.getQueryData<{ data?: FileTree }>(['folders', 'tree']);
      queryClient.setQueryData<{ data?: FileTree }>(['folders', 'tree'], prev => {
        if (!prev?.data) return prev;
        return { ...prev, data: moveInTree(prev.data, { kind: 'note', id }, folderId) };
      });
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(['folders', 'tree'], ctx.snapshot);
      toast.error(getErrorDetail(err, t('files.failed_to_move_note')));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders', 'tree'] });
    },
    onSuccess: res => {
      if (res.data) queryClient.setQueryData(['notes', res.data.id], res);
      // refetchType 'none': don't reset the open editor draft.
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      toast.success(t('files.note_moved'));
      onMove?.();
    },
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
