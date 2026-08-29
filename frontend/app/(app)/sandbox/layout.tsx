import { UserRole } from '@/client';
import { RoleGuard } from '@/features/auth/components/RoleGuard';

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard requiredRole={UserRole.ADMIN}>{children}</RoleGuard>;
}
