import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type AiToolPermissionRead } from '@/client';
import { AI_PERMISSIONS_QUERY_KEY } from '@/features/assist/hooks/useAiToolPermissions';
import { sdk } from '@/lib/apiClient';

import { applyPermissionDraft, type PermissionDraft } from '../utils';

import type { UseMutationResult } from '@tanstack/react-query';

/** Saves changed tools as `tool name -> autoApprove`. The switches show the change before the backend answers. */
export function useSaveAiToolPermissions(): UseMutationResult<
  AiToolPermissionRead[],
  Error,
  PermissionDraft,
  AiToolPermissionRead[] | undefined
> {
  const t = useTranslations();
  const queryClient = useQueryClient();

  return useMutation({
    // One scope: the backend merges the map on each request, so two requests at once could lose one.
    scope: { id: 'user-ai-tool-permissions' },
    mutationFn: async (changes: PermissionDraft): Promise<AiToolPermissionRead[]> =>
      (await sdk.usersUpdateAiToolPermissions({ body: { permissions: changes } })).data ?? [],
    onMutate: async changes => {
      await queryClient.cancelQueries({ queryKey: AI_PERMISSIONS_QUERY_KEY });
      const previous = queryClient.getQueryData<AiToolPermissionRead[]>(AI_PERMISSIONS_QUERY_KEY);
      if (previous) queryClient.setQueryData(AI_PERMISSIONS_QUERY_KEY, applyPermissionDraft(previous, changes));
      return previous;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AI_PERMISSIONS_QUERY_KEY });
      toast.success(t('settings.settings_saved'));
    },
    onError: (_error, _changes, previous) => {
      queryClient.setQueryData(AI_PERMISSIONS_QUERY_KEY, previous);
      toast.error(t('settings.failed_to_save'));
    },
  });
}
