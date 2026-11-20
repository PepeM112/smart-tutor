import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/features/auth/store/authStore';
import { removeAttemptDrafts } from '@/features/courses/hooks/useAttemptDraft';
import { sdk } from '@/lib/apiClient';
import { Routes } from '@/lib/routes';

/** Ends the session and clears what this browser kept of the user. The sidebar and the phone More sheet share it. */
export function useLogout(): () => Promise<void> {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useAuthStore(state => state.logout);
  const userId = useAuthStore(state => state.user?.id);

  return async () => {
    try {
      await sdk.usersLogout();
    } catch {
      // Best-effort — clear client state regardless
    }
    // Only here, not in the 401/403 path: an expired session must keep the draft.
    if (userId) removeAttemptDrafts(userId);
    logout();
    // Drop every cached answer: the next user of this browser must not see this user's data.
    queryClient.clear();
    router.push(Routes.LOGIN);
    router.refresh();
  };
}
