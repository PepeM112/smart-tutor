import { useQuery } from '@tanstack/react-query';

import type { AiToolPermissionRead } from '@/client';
import { sdk } from '@/lib/apiClient';

import type { UseQueryResult } from '@tanstack/react-query';

export const AI_PERMISSIONS_QUERY_KEY = ['ai-tool-permissions'] as const;

/** The per-tool "run without asking" setting of the user, with the backend default of each tool. */
export function useAiToolPermissions(): UseQueryResult<AiToolPermissionRead[]> {
  return useQuery({
    queryKey: AI_PERMISSIONS_QUERY_KEY,
    queryFn: async (): Promise<AiToolPermissionRead[]> => {
      const res = await sdk.usersGetAiToolPermissions();
      return res.data ?? [];
    },
  });
}
