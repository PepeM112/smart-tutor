import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type FileTree, type NoteRead } from '@/client';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

type ToggleVars = { id: string; isFavorite: boolean };

/**
 * Star or unstar a note, with an optimistic update of the file tree (the sidebar list and the stars
 * update at once).
 *
 * Editor safety: the favorite flag does not change `version` or `updatedAt` on the server. The editor
 * (`useNoteDraft`) only reacts to a newer `version`, so a patched note cache never shows a conflict
 * and never resets the editor. For the same reason this hook never invalidates `fileQueryKeys.note(id)`:
 * a refetch there is the thing that could hit an open editor. Only the tree is refetched when done.
 */
export function useToggleFavorite() {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { mutate: toggleFavorite, isPending: isTogglingFavorite } = useMutation({
    mutationFn: ({ id, isFavorite }: ToggleVars) =>
      sdk.notesSetFavorite({ path: { note_id: id }, body: { isFavorite } }),
    onMutate: async ({ id, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: fileQueryKeys.foldersTree() });
      const previousTree = queryClient.getQueryData<{ data?: FileTree }>(fileQueryKeys.foldersTree());
      const favoritedAt = isFavorite ? new Date() : null;

      queryClient.setQueryData<{ data?: FileTree }>(fileQueryKeys.foldersTree(), old =>
        old?.data
          ? {
              ...old,
              data: {
                ...old.data,
                notes: old.data.notes.map(n => (n.id === id ? { ...n, isFavorite, favoritedAt } : n)),
              },
            }
          : old
      );
      // Same fields only, so `version`/`updatedAt` stay as the editor knows them.
      queryClient.setQueryData<{ data?: NoteRead }>(fileQueryKeys.note(id), old =>
        old?.data ? { ...old, data: { ...old.data, isFavorite, favoritedAt } } : old
      );
      return { previousTree };
    },
    onError: (err, { id, isFavorite }, context) => {
      if (context?.previousTree) queryClient.setQueryData(fileQueryKeys.foldersTree(), context.previousTree);
      // Undo the flag in the single note cache too.
      queryClient.setQueryData<{ data?: NoteRead }>(fileQueryKeys.note(id), old =>
        old?.data ? { ...old, data: { ...old.data, isFavorite: !isFavorite } } : old
      );
      toast.error(getErrorDetail(err, t('notes.failed_to_update_favorite')));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: fileQueryKeys.foldersTree() });
    },
  });

  return { toggleFavorite, isTogglingFavorite };
}
