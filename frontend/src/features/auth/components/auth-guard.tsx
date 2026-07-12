'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/auth-store';
import { clearSessionCookie } from '../utils/session-cookie';

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
      .catch(() => {
        logout();
        clearSessionCookie();
        router.replace(Routes.LOGIN);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
