'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/auth-store';
import { clearSessionCookie } from '../utils/session-cookie';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, setUser, logout } = useAuthStore();

  useEffect(() => {
    sdk
      .usersMe()
      .then(res => setUser(res.data ?? null))
      .catch(() => {
        logout();
        clearSessionCookie();
        router.replace(Routes.LOGIN);
      });
  }, [setUser, logout, router]);

  if (isLoading || !isAuthenticated) return null;

  return <>{children}</>;
}
