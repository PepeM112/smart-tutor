'use client';

import { UserRole } from '@/client';
import { AuthGuard } from '@/features/auth/components/auth-guard';

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole={UserRole.ADMIN}>{children}</AuthGuard>;
}
