'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { type UserRole } from '@/client';
import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/auth-store';
import { clearSessionCookie } from '../utils/session-cookie';

type AuthGuardProps = {
  requiredRole?: UserRole;
  children: React.ReactNode;
};

export function AuthGuard({ requiredRole, children }: AuthGuardProps) {
  const router = useRouter();
  const t = useTranslations();
  const setUser = useAuthStore(s => s.setUser);
  const logout = useAuthStore(s => s.logout);
  const didRedirect = useRef(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await sdk.usersMe();
      // Sync to Zustand so non-query consumers (sidebar, etc.) can read the user
      setUser(res.data ?? null);
      return res;
    },
    retry: (failureCount, err) => {
      const status = (err as { status?: number })?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const user = data?.data ?? null;

  // Handle auth errors — redirect to login on 401/403
  if (isError && !didRedirect.current) {
    const status = (error as { status?: number })?.status;
    if (status === 401 || status === 403) {
      didRedirect.current = true;
      logout();
      clearSessionCookie();
      router.replace(Routes.LOGIN);
      return null;
    }

    // Non-auth error (network blip, 500) — trust cached user if available
    const cachedUser = useAuthStore.getState().user;
    if (cachedUser) {
      return <>{children}</>;
    }

    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{t('auth.could_not_connect')}</p>
          <Button onClick={() => window.location.reload()}>{t('common.try_again')}</Button>
        </div>
      </div>
    );
  }

  if (isLoading || !user) return null;

  if (requiredRole && user.role !== requiredRole) {
    router.replace(Routes.DASHBOARD);
    return null;
  }

  return <>{children}</>;
}
