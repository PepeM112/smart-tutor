import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type AiToolPermissionRead } from '@/client';
import { AI_PERMISSIONS_QUERY_KEY } from '@/features/assist/hooks/useAiToolPermissions';
import { sdk } from '@/lib/apiClient';

import { applyPermissionDraft, type PermissionDraft } from '../utils';

import type { UseMutationResult } from '@tanstack/react-query';

const MUTATION_KEY = ['user-ai-tool-permissions'] as const;

/** Saves changed tools as `tool name -> autoApprove`. The switches show the change before the backend answers. */
export function useSaveAiToolPermissions(): UseMutationResult<AiToolPermissionRead[], Error, PermissionDraft> {
  const t = useTranslations();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: MUTATION_KEY,
    // One scope: the backend merges the map on each request, so two requests at once could lose one.
    scope: { id: 'user-ai-tool-permissions' },
    mutationFn: async (changes: PermissionDraft): Promise<AiToolPermissionRead[]> =>
      (await sdk.usersUpdateAiToolPermissions({ body: { permissions: changes } })).data ?? [],
    onMutate: async changes => {
      await queryClient.cancelQueries({ queryKey: AI_PERMISSIONS_QUERY_KEY });
      const current = queryClient.getQueryData<AiToolPermissionRead[]>(AI_PERMISSIONS_QUERY_KEY);
      if (current) queryClient.setQueryData(AI_PERMISSIONS_QUERY_KEY, applyPermissionDraft(current, changes));
    },
    // No snapshot rollback: it would also undo a later toggle that is still pending. The refetch in
    // `onSettled` puts the server state back after a failure.
    onError: () => {
      toast.error(t('settings.failed_to_save'));
    },
    // Refetch only after the last overlapping save. An earlier refetch would flip a pending switch back.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: AI_PERMISSIONS_QUERY_KEY });
      }
    },
  });
}
