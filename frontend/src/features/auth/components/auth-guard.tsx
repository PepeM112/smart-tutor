'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/auth-store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, setUser, logout, setLoading } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(Routes.LOGIN);
      return;
    }

    setLoading(true);
    sdk
      .usersMe()
      .then(res => setUser(res.data ?? null))
      .catch(async () => {
        try {
          const refreshResult = await sdk.usersRefresh();
          setUser(refreshResult.data ?? null);
        } catch {
          logout();
          document.cookie = 'session=; path=/; max-age=0';
          router.replace(Routes.LOGIN);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
