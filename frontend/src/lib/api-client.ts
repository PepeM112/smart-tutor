import { client } from '@/client/client.gen';
import * as sdk from '@/client/sdk.gen';
import * as types from '@/client/types.gen';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { clearSessionCookie } from '@/features/auth/utils/session-cookie';

import { Routes } from './routes';

client.setConfig({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1',
  credentials: 'include',
  throwOnError: true,
});

let refreshPromise: Promise<void> | null = null;

client.interceptors.response.use(async (response, request, options) => {
  if (response.status !== 401) return response;

  const url = new URL(response.url);
  if (url.pathname.endsWith('/refresh') || url.pathname.endsWith('/login')) {
    return response;
  }

  refreshPromise ??= sdk
    .usersRefresh()
    .then(result => {
      if (result.data) {
        useAuthStore.getState().setUser(result.data);
      }
    })
    .catch(() => {
      useAuthStore.getState().logout();
      clearSessionCookie();
      window.location.href = Routes.LOGIN;
    })
    .finally(() => {
      refreshPromise = null;
    });

  await refreshPromise;

  // Retry with a fresh Request — the original's body stream was already consumed
  return fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: options.body as BodyInit | undefined,
    credentials: 'include',
    redirect: 'follow',
  });
});

export { client, sdk, types };
