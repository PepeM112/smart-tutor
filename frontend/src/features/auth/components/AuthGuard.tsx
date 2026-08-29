'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/apiClient';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/authStore';

export function AuthGuard({ children }: { children: React.ReactNode }) {
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

  const errorStatus = (error as { status?: number })?.status;
  const isAuthError = isError && (errorStatus === 401 || errorStatus === 403);

  useEffect(() => {
    if (isAuthError && !didRedirect.current) {
      didRedirect.current = true;
      logout();
      router.replace(Routes.LOGIN);
    }
  }, [isAuthError, logout, router]);

  if (isAuthError) return null;

  const user = data?.data ?? null;

  if (isError) {
    // Non-auth errors (network blip, 5xx) fall back to last-known user instead of logging out
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

  return <>{children}</>;
}
