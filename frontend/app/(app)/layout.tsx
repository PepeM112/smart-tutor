import { Breadcrumb } from '@/components/breadcrumb';
import { Sidebar } from '@/components/layout/sidebar';
import { AuthGuard } from '@/features/auth/components/auth-guard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Breadcrumb />
          <div className="px-8 pb-8">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}
