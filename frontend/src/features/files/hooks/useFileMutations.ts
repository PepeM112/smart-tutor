'use client';

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { FileTree, NoteRead } from '@/client';
import { useTrashMutations } from '@/features/trash/hooks/useTrashMutations';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { moveInTree } from '../lib/fileTree';
import { fileQueryKeys, invalidateAfterFileChange } from '../lib/queryKeys';

type FileMutationsOptions = {
  /**
   * Refetch the notes list after a trash. Only for pages with no open note editor
   * (the notes list page). Default 'none' keeps an open editor from resetting.
   */
  refetchNotes?: boolean;
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
export function useFileMutations({ refetchNotes = false }: FileMutationsOptions = {}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  // Undo in the toasts below restores through the shared trash hook.
  const { restoreItem } = useTrashMutations({ refetchNotes });

  // ── trash folder ─────────────────────────────────────────────────────────────

  const { mutate: trashFolder, isPending: isTrashingFolder } = useMutation({
    mutationFn: (folderId: string) => sdk.foldersDelete({ path: { folder_id: folderId } }),
    onSuccess: (_, folderId) => {
      invalidateAfterFileChange(queryClient, { trash: true, notes: true, refetchNotes });
      toast.success(t('files.folder_moved_to_trash'), {
        action: { label: t('common.undo'), onClick: () => restoreItem({ kind: 'folder', id: folderId, silent: true }) },
      });
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_delete_folder'))),
  });

  // ── trash note ───────────────────────────────────────────────────────────────

  const { mutate: trashNote, isPending: isTrashingNote } = useMutation({
    mutationFn: (noteId: string) => sdk.notesDelete({ path: { note_id: noteId } }),
    onSuccess: (_, noteId) => {
      invalidateAfterFileChange(queryClient, { trash: true, notes: true, refetchNotes });
      toast.success(t('files.note_moved_to_trash'), {
        action: { label: t('common.undo'), onClick: () => restoreItem({ kind: 'note', id: noteId, silent: true }) },
      });
    },
    onError: err => toast.error(getErrorDetail(err, t('notes.failed_to_delete'))),
  });

  // ── rename folder ─────────────────────────────────────────────────────────────

  const { mutate: renameFolder, isPending: isRenamingFolder } = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      sdk.foldersUpdate({ path: { folder_id: id }, body: { name } }),
    onSuccess: () => {
      invalidateAfterFileChange(queryClient);
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
          queryKey: fileQueryKeys.note(id),
          queryFn: () => sdk.notesGet({ path: { note_id: id } }),
          staleTime: 0,
        })
      );
      const version = noteRes.data!.version;
      return sdk.notesUpdate({ path: { note_id: id }, body: { title: name, version } });
    },
    onSuccess: res => {
      // P1-4: patch the note cache so the preview title updates immediately.
      if (res.data) queryClient.setQueryData(fileQueryKeys.note(res.data.id), res);
      invalidateAfterFileChange(queryClient, { notes: true });
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
      await queryClient.cancelQueries({ queryKey: fileQueryKeys.foldersTree() });
      const snapshot = queryClient.getQueryData<{ data?: FileTree }>(fileQueryKeys.foldersTree());
      queryClient.setQueryData<{ data?: FileTree }>(fileQueryKeys.foldersTree(), prev => {
        if (!prev?.data) return prev;
        return { ...prev, data: moveInTree(prev.data, { kind: 'folder', id }, targetFolderId) };
      });
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(fileQueryKeys.foldersTree(), ctx.snapshot);
      toast.error(getErrorDetail(err, t('files.failed_to_move')));
    },
    // P1-1: invalidate both the tree and the flat list so MoveDialog/breadcrumbs stay fresh.
    onSettled: () => invalidateAfterFileChange(queryClient),
    onSuccess: () => {
      toast.success(t('files.moved'));
    },
  });

  // ── move note ─────────────────────────────────────────────────────────────────
  // Optimistic: same pattern as moveFolder.

  const { mutate: moveNote, isPending: isMovingNote } = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      sdk.notesMove({ path: { note_id: id }, body: { folderId } }),

    onMutate: async ({ id, folderId }) => {
      await queryClient.cancelQueries({ queryKey: fileQueryKeys.foldersTree() });
      const snapshot = queryClient.getQueryData<{ data?: FileTree }>(fileQueryKeys.foldersTree());
      queryClient.setQueryData<{ data?: FileTree }>(fileQueryKeys.foldersTree(), prev => {
        if (!prev?.data) return prev;
        return { ...prev, data: moveInTree(prev.data, { kind: 'note', id }, folderId) };
      });
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(fileQueryKeys.foldersTree(), ctx.snapshot);
      toast.error(getErrorDetail(err, t('files.failed_to_move_note')));
    },
    onSettled: () => invalidateAfterFileChange(queryClient, { notes: true }),
    onSuccess: res => {
      // Merge only folderId: an open editor owns content and version, so a move must not reset them.
      const moved = res.data;
      if (moved) {
        queryClient.setQueryData<{ data: NoteRead }>(fileQueryKeys.note(moved.id), old =>
          old ? { ...old, data: { ...old.data, folderId: moved.folderId } } : old
        );
      }
      toast.success(t('files.note_moved'));
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
