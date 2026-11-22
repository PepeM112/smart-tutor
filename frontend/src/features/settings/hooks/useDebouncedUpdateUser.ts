import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import {
  getSentRequest,
  getUnconfirmed,
  markSent,
  mergeUserUpdate,
  previousValuesOf,
  trackUnconfirmed,
  untrackUnconfirmed,
  type DelayedUserUpdate,
} from './unconfirmedUserChanges';
import { useUpdateUser } from './useUpdateUser';

/**
 * Why a delay: a user who switches a setting quickly caused one request per click, and each answer
 * re-applied an older value on the page. Now only the last value of a field is sent.
 */
export const SAVE_DELAY_MS = 1500;

interface SaveOptions {
  /** Changes with the same field replace each other. Default: the keys of the body. */
  field?: string;
  /** Runs at once with the new value, and again with the old value if the save fails. */
  show?: (body: DelayedUserUpdate) => void;
}

type SaveUser = (body: DelayedUserUpdate, options?: SaveOptions) => void;

/**
 * Saves a setting with a delay. The change shows at once (user store, `me` cache, `show`); the request goes
 * out `SAVE_DELAY_MS` after the last change of the same field, and on unmount and `pagehide`.
 * While a change is not confirmed, every response from the backend keeps it on top (see `useUpdateUser`).
 */
export function useDebouncedUpdateUser(): SaveUser {
  const queryClient = useQueryClient();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const showInCaches = useCallback(
    (body: DelayedUserUpdate): void => {
      const { user, setUser } = useAuthStore.getState();
      if (!user) return;
      const merged = mergeUserUpdate(user, body);
      setUser(merged);
      queryClient.setQueryData<{ data?: UserRead }>(['me'], current => current && { ...current, data: merged });
    },
    [queryClient]
  );

  const { mutate: sendUpdate } = useUpdateUser({
    onSuccess: (_user, body) => {
      const sent = getSentRequest(body);
      const change = sent && getUnconfirmed(sent.field);
      if (!sent || !change) return;
      // A newer choice of the same field is still waiting. The sent one is now the confirmed value.
      if (change.body === sent.body) untrackUnconfirmed(sent.field);
      else change.previous = sent.body;
    },
    onError: body => {
      const sent = getSentRequest(body);
      const change = sent && getUnconfirmed(sent.field);
      // A newer choice replaced this one: it stays, and it has its own save.
      if (!sent || !change || change.body !== sent.body) return;
      const { field } = sent;
      untrackUnconfirmed(field);
      showInCaches(change.previous);
      change.show?.(change.previous);
    },
  });

  const send = useCallback(
    (field: string): void => {
      clearTimeout(timers.current.get(field));
      timers.current.delete(field);
      const change = getUnconfirmed(field);
      if (!change) return;
      markSent(change.body, field);
      sendUpdate(change.body);
    },
    [sendUpdate]
  );

  const saveUser = useCallback<SaveUser>(
    (body, { field = Object.keys(body).join(','), show } = {}) => {
      const user = useAuthStore.getState().user;
      if (!user) return;
      // Keep the oldest confirmed value of a streak of changes: that is where a failed save goes back to.
      const previous = getUnconfirmed(field)?.previous ?? previousValuesOf(user, body);
      trackUnconfirmed(field, { body, previous, show });
      showInCaches(body);
      show?.(body);

      clearTimeout(timers.current.get(field));
      timers.current.set(
        field,
        setTimeout(() => send(field), SAVE_DELAY_MS)
      );
    },
    [send, showInCaches]
  );

  useEffect(() => {
    const pending = timers.current;
    // The page is going away: a normal request may be cancelled, a `keepalive` one survives the unload.
    const handlePageHide = (): void => {
      [...pending.keys()].forEach(field => {
        const change = getUnconfirmed(field);
        clearTimeout(pending.get(field));
        pending.delete(field);
        if (!change) return;
        untrackUnconfirmed(field);
        sdk.usersUpdateMe({ body: change.body, keepalive: true }).catch(() => undefined);
      });
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      // The user leaves the page within the delay: send what is waiting now.
      [...pending.keys()].forEach(send);
    };
  }, [send]);

  return saveUser;
}
