'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { type UserRole } from '@/client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/auth-store';

function subscribeToHydration(callback: () => void) {
  return useAuthStore.persist.onFinishHydration(callback);
}

function getHydrated() {
  return useAuthStore.persist.hasHydrated();
}

function getServerHydrated() {
  return false;
}

type RoleGuardProps = {
  requiredRole: UserRole;
  children: React.ReactNode;
};

export function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeToHydration, getHydrated, getServerHydrated);
  const userRole = useAuthStore(s => s.user?.role);
  const hasAccess = userRole === requiredRole;

  useEffect(() => {
    if (hydrated && !hasAccess) {
      router.replace(Routes.DASHBOARD);
    }
  }, [hydrated, hasAccess, router]);

  if (!hydrated || !hasAccess) return null;

  return <>{children}</>;
}
