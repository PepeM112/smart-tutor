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
    let ignore = false;

    sdk
      .usersMe()
      .then(res => {
        if (!ignore) setUser(res.data ?? null);
      })
      .catch((err: unknown) => {
        if (ignore) return;

        const status = (err as { status?: number })?.status;
        if (status === 401 || status === 403) {
          logout();
          clearSessionCookie();
          router.replace(Routes.LOGIN);
        }
      });

    return () => {
      ignore = true;
    };
  }, [setUser, logout, router]);

  if (isLoading || !isAuthenticated) return null;

  return <>{children}</>;
}
