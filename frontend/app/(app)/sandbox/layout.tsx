import { UserRole } from '@/client';
import { RoleGuard } from '@/features/auth/components/role-guard';

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard requiredRole={UserRole.ADMIN}>{children}</RoleGuard>;
}
