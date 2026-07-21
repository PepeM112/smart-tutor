'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { type UserRole } from '@/client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/auth-store';

type RoleGuardProps = {
  requiredRole: UserRole;
  children: React.ReactNode;
};

export default function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const router = useRouter();
  const userRole = useAuthStore(s => s.user?.role);
  const hasAccess = userRole === requiredRole;

  useEffect(() => {
    if (!hasAccess) {
      router.replace(Routes.DASHBOARD);
    }
  }, [hasAccess, router]);

  if (!hasAccess) return null;

  return <>{children}</>;
}
