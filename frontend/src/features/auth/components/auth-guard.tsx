'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/auth-store';
import { clearSessionCookie } from '../utils/session-cookie';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const isLoading = useAuthStore(s => s.isLoading);
  const setUser = useAuthStore(s => s.setUser);
  const logout = useAuthStore(s => s.logout);

  const [fetchError, setFetchError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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
        } else {
          setFetchError(true);
          // Resolve loading — trust cached user from localStorage if available
          setUser(useAuthStore.getState().user ?? null);
        }
      });

    return () => {
      ignore = true;
    };
  }, [setUser, logout, router, retryKey]);

  if (fetchError && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Could not connect to the server.</p>
          <Button
            onClick={() => {
              setFetchError(false);
              setRetryKey(k => k + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !user) return null;

  return <>{children}</>;
}
