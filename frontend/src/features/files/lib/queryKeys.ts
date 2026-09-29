import type { QueryClient } from '@tanstack/react-query';

/** Central query key definitions for the files feature. */
export const fileQueryKeys = {
  /** ['folders'] — prefix that covers both the flat list and the tree sub-key. */
  folders: () => ['folders'] as const,
  /** ['folders', 'tree'] — the full non-trashed file tree. */
  foldersTree: () => ['folders', 'tree'] as const,
  /** ['folders', id, 'delete-preview'] — counts for the delete-confirm dialog. */
  folderDeletePreview: (id: string) => ['folders', id, 'delete-preview'] as const,
  /** ['notes'] — the flat notes list. */
  notes: () => ['notes'] as const,
  /** ['notes', id] — a single note by id. */
  note: (id: string) => ['notes', id] as const,
  /** ['trash'] — the trash list. */
  trash: () => ['trash'] as const,
} as const;

type InvalidateFileOpts = {
  /** Also invalidate the trash list. Default: false. */
  trash?: boolean;
  /**
   * Also invalidate the flat notes list. Default: false.
   *
   * Uses refetchType:'none' so an open editor is NOT remounted mid-edit.
   * The list refreshes on the next navigation or manual refetch.
   * This preserves existing behaviour from trashNote, moveNote, renameNote.
   */
  notes?: boolean;
  /**
   * With `notes`: refetch the notes list now. Use it only where no note editor is open
   * (e.g. the notes list page, or after creating a note).
   */
  refetchNotes?: boolean;
};

/**
 * Invalidate the file system caches after any structural change
 * (create, rename, move, trash, restore).
 *
 * Invalidating `['folders']` covers both the flat list and the tree
 * because `['folders', 'tree']` is a sub-key of `['folders']`.
 */
export function invalidateAfterFileChange(queryClient: QueryClient, opts: InvalidateFileOpts = {}): void {
  void queryClient.invalidateQueries({ queryKey: fileQueryKeys.folders() });
  if (opts.notes) {
    void queryClient.invalidateQueries({
      queryKey: fileQueryKeys.notes(),
      refetchType: opts.refetchNotes ? 'active' : 'none',
    });
  }
  if (opts.trash) {
    void queryClient.invalidateQueries({ queryKey: fileQueryKeys.trash() });
  }
}
