import { client } from '@/client/client.gen';
import * as sdk from '@/client/sdk.gen';
import * as types from '@/client/types.gen';
import { useAuthStore } from '@/features/auth/store/auth-store';

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
  if (url.pathname.endsWith('/refresh') || url.pathname.endsWith('/login')) {
    return response;
  }

  refreshFailed = false;

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

  return fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: options.body as BodyInit | undefined,
    credentials: 'include',
    redirect: 'follow',
  });
});

export { client, sdk, types };
