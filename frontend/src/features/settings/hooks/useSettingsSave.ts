import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type UserRead, type UserUpdate } from '@/client';
import { AI_PERMISSIONS_QUERY_KEY } from '@/features/assist/hooks/useAiToolPermissions';
import { sdk } from '@/lib/apiClient';

import { type PermissionDraft } from '../utils';

interface UseSettingsSaveOptions {
  settingsPayload: UserUpdate;
  permissionsPayload: PermissionDraft;
  /** Called with the updated user after the settings request succeeds. */
  onUserSaved: (user: UserRead) => void;
  /** Called after the permissions request succeeds. */
  onPermissionsSaved: () => void;
}

export function useSettingsSave({
  settingsPayload,
  permissionsPayload,
  onUserSaved,
  onPermissionsSaved,
}: UseSettingsSaveOptions) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { mutate: saveSettings, isPending: isSaving } = useMutation({
    // Both requests run together. Each result is kept, so one failure does not hide the other success.
    mutationFn: async () => {
      const [settingsResult, permissionsResult] = await Promise.allSettled([
        Object.keys(settingsPayload).length === 0
          ? Promise.resolve(null)
          : sdk.usersUpdateMe({ body: settingsPayload }).then(res => res.data!),
        Object.keys(permissionsPayload).length === 0
          ? Promise.resolve(null)
          : sdk.usersUpdateAiToolPermissions({ body: { permissions: permissionsPayload } }).then(res => res.data ?? []),
      ]);
      return { settingsResult, permissionsResult };
    },
    onSuccess: ({ settingsResult, permissionsResult }) => {
      if (settingsResult.status === 'fulfilled' && settingsResult.value) {
        onUserSaved(settingsResult.value);
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      }

      if (permissionsResult.status === 'fulfilled') {
        // Show the saved values at once, so the switches do not jump back before the refetch ends.
        if (permissionsResult.value && permissionsResult.value.length > 0)
          queryClient.setQueryData(AI_PERMISSIONS_QUERY_KEY, permissionsResult.value);
        onPermissionsSaved();
        void queryClient.invalidateQueries({ queryKey: AI_PERMISSIONS_QUERY_KEY });
      }

      const isFailed = settingsResult.status === 'rejected' || permissionsResult.status === 'rejected';
      if (isFailed) toast.error(t('settings.failed_to_save'));
      else toast.success(t('settings.settings_saved'));
    },
    onError: () => {
      toast.error(t('settings.failed_to_save'));
    },
  });

  return { saveSettings, isSaving };
}
