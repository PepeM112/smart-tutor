import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type UserRead, type UserUpdate } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import type { UseMutationResult } from '@tanstack/react-query';

/**
 * Saves one change to the user profile. Each setting calls it with its own fields.
 * One scope for every setting: the requests run one after the other, so a slow response
 * never replaces the user with data older than a later save.
 */
export function useUpdateUser(): UseMutationResult<UserRead, Error, UserUpdate> {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const setUser = useAuthStore(s => s.setUser);

  return useMutation({
    scope: { id: 'user-update' },
    mutationFn: async (body: UserUpdate): Promise<UserRead> => (await sdk.usersUpdateMe({ body })).data!,
    onSuccess: updatedUser => {
      setUser(updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('settings.settings_saved'));
    },
    onError: () => {
      toast.error(t('settings.failed_to_save'));
    },
  });
}
