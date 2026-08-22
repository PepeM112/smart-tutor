import { Breadcrumb } from '@/components/breadcrumb';
import { MobileHeader } from '@/components/layout/mobile-header';
import { Sidebar } from '@/components/layout/sidebar';
import { AssistPanel } from '@/features/assist/components/AssistPanel';
import { AuthGuard } from '@/features/auth/components/auth-guard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col lg:flex-row bg-background">
        <div className="hidden lg:flex">
          <Sidebar />
        </div>
        <div className="lg:hidden">
          <MobileHeader />
        </div>
        <main className="flex-1 overflow-auto">
          <Breadcrumb />
          <div className="px-4 pb-4 lg:px-8 lg:pb-8">{children}</div>
        </main>
      </div>
      <AssistPanel />
    </AuthGuard>
  );
}
