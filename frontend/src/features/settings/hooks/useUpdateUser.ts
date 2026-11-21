import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type UserRead, type UserUpdate } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import type { UseMutationResult } from '@tanstack/react-query';

/** The one scope for every request to `usersUpdateMe`. */
export const USER_UPDATE_SCOPE = 'user-update';

type UpdateUserHandlers = {
  /** Runs before the request. Use it to show the change before the backend answers. */
  onMutate?: (body: UserUpdate) => void;
  onSuccess?: (user: UserRead, body: UserUpdate) => void;
  onError?: (body: UserUpdate) => void;
};

/**
 * Saves one change to the user profile. Each setting calls it with its own fields.
 * One scope for every setting: the requests run one after the other, so a slow response
 * never replaces the user with data older than a later save.
 * The handlers belong to the hook, not to `mutate`: `mutate` runs its own callbacks only for the last call.
 */
export function useUpdateUser(handlers: UpdateUserHandlers = {}): UseMutationResult<UserRead, Error, UserUpdate> {
  const t = useTranslations();
  const setUser = useAuthStore(s => s.setUser);

  return useMutation({
    scope: { id: USER_UPDATE_SCOPE },
    mutationFn: async (body: UserUpdate): Promise<UserRead> => (await sdk.usersUpdateMe({ body })).data!,
    onMutate: body => handlers.onMutate?.(body),
    onSuccess: (updatedUser, body) => {
      setUser(updatedUser);
      toast.success(t('settings.settings_saved'));
      handlers.onSuccess?.(updatedUser, body);
    },
    onError: (_error, body) => {
      toast.error(t('settings.failed_to_save'));
      handlers.onError?.(body);
    },
  });
}
