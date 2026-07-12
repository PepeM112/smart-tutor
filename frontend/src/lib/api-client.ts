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

let isRefreshing = false;

client.interceptors.response.use(async response => {
  if (response.status === 401 && !isRefreshing) {
    const url = new URL(response.url);
    if (url.pathname.endsWith('/refresh') || url.pathname.endsWith('/login')) {
      return response;
    }

    isRefreshing = true;
    try {
      const refreshResult = await sdk.usersRefresh();
      if (refreshResult.data) {
        useAuthStore.getState().setUser(refreshResult.data);
      }
    } catch {
      useAuthStore.getState().logout();
      clearSessionCookie();
      window.location.href = Routes.LOGIN;
    } finally {
      isRefreshing = false;
    }
  }
  return response;
});

export { client, sdk, types };
