import { client } from '@/client/client.gen';
import * as sdk from '@/client/sdk.gen';
import * as types from '@/client/types.gen';
import { useAuthStore } from '@/features/auth/store/authStore';

import { Routes } from './routes';

client.setConfig({
  baseUrl: '',
  credentials: 'include',
  throwOnError: true,
});

let refreshPromise: Promise<void> | null = null;
let refreshFailed = false;

client.interceptors.response.use(async (response, request, options) => {
  if (response.status !== 401) return response;

  const url = new URL(response.url);
  // Skip refresh on auth endpoints themselves, or a 401 there loops forever
  if (url.pathname.endsWith('/refresh') || url.pathname.endsWith('/login')) {
    return response;
  }

  if (!refreshPromise) {
    refreshFailed = false;
  }

  refreshPromise ??= sdk
    .usersRefresh()
    .then(result => {
      if (result.data) {
        useAuthStore.getState().setUser(result.data);
      }
    })
    .catch(() => {
      refreshFailed = true;
      useAuthStore.getState().logout();
      window.location.href = Routes.LOGIN;
    })
    .finally(() => {
      refreshPromise = null;
    });

  await refreshPromise;

  if (refreshFailed) return response;

  // Replay with raw fetch so this interceptor doesn't fire again
  return fetch(request.url, {
    method: request.method,
    headers: request.headers,
    // SAFETY: hey-api's serializedBody/body is always a valid BodyInit when present
    body: (options.serializedBody ?? options.body) as BodyInit | undefined,
    credentials: 'include',
    redirect: 'follow',
  });
});

client.interceptors.error.use((_error, response) => {
  const err = typeof _error === 'object' && _error !== null ? _error : { detail: String(_error) };
  // SAFETY: error interceptor must return the enriched error object; `as never` satisfies hey-api's error type contract
  return { ...err, status: response.status } as never;
});

export { client, sdk, types };
