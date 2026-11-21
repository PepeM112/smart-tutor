'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { type UserRole } from '@/client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/authStore';

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

/** Client-side gate for a route. It hides the page from a user without the role. The backend still checks every call. */
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

  // The user is null until Zustand persist has rehydrated. Deciding earlier would redirect an admin on a reload.
  if (!hydrated || !hasAccess) return null;

  return <>{children}</>;
}
