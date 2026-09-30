'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { TrashItemRead } from '@/client';
import { invalidateAfterFileChange } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

export type TrashTarget = {
  kind: TrashItemRead['kind'];
  id: string;
};

export type RestoreVars = TrashTarget & {
  /** Skip the success toast. The Undo toast already told the user what happened. */
  silent?: boolean;
};

type Options = {
  /**
   * Refetch the notes list now. Only set it where no note editor is open
   * (e.g. the notes list page). See `invalidateAfterFileChange`.
   */
  refetchNotes?: boolean;
};

/**
 * The one place for trash actions: restore, delete forever and empty trash.
 *
 * Extra behaviour per call (redirect, refetch a note) goes in the second argument:
 * `restoreItem(vars, { onSuccess })`. TanStack runs it after the callbacks here.
 */
export function useTrashMutations({ refetchNotes = false }: Options = {}) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  // Trash changes what the tree, the trash list and the notes list show.
  const invalidateAll = (): void => invalidateAfterFileChange(queryClient, { trash: true, notes: true, refetchNotes });

  const { mutate: restoreItem, isPending: isRestoring } = useMutation({
    mutationFn: ({ kind, id }: RestoreVars) => sdk.trashRestore({ path: { kind, item_id: id } }),
    onSuccess: (_, { silent }) => {
      invalidateAll();
      if (!silent) toast.success(t('trash.restored'));
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_restore'))),
  });

  const { mutate: hardDeleteItem, isPending: isHardDeleting } = useMutation({
    mutationFn: ({ kind, id }: TrashTarget) => sdk.trashHardDelete({ path: { kind, item_id: id } }),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('trash.deleted_forever'));
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_delete'))),
  });

  const { mutate: emptyTrash, isPending: isEmptying } = useMutation({
    mutationFn: () => sdk.trashEmpty(),
    onSuccess: () => {
      invalidateAll();
      toast.success(t('trash.emptied'));
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_empty'))),
  });

  return {
    restoreItem,
    isRestoring,
    hardDeleteItem,
    isHardDeleting,
    emptyTrash,
    isEmptying,
  };
}
