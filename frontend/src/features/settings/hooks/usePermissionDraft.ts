import { useCallback, useMemo, useState } from 'react';

import { useAiToolPermissions } from '@/features/assist/hooks/useAiToolPermissions';

import { applyPermissionDraft, buildPermissionsPayload, mergePermissionDraft, type PermissionDraft } from '../utils';

/**
 * Local draft of the AI tool permissions.
 * The draft holds only the tools the user changed. Tools the user did not touch always follow the
 * server data, so a refetch (e.g. "Always allow" in the chat) never loses a change.
 */
export function usePermissionDraft() {
  const { data: serverPermissions, isLoading, isError } = useAiToolPermissions();
  const [draft, setDraft] = useState<PermissionDraft>({});

  const payload = useMemo(() => buildPermissionsPayload(serverPermissions ?? [], draft), [serverPermissions, draft]);
  const permissions = useMemo(
    () => (serverPermissions ? applyPermissionDraft(serverPermissions, draft) : undefined),
    [serverPermissions, draft]
  );

  const change = useCallback(
    (changes: PermissionDraft) => {
      setDraft(prev => mergePermissionDraft(serverPermissions ?? [], prev, changes));
    },
    [serverPermissions]
  );

  const reset = useCallback(() => setDraft({}), []);

  return { permissions, payload, isLoading, isError, change, reset };
}
