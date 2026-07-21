'use client';

import { Breadcrumb } from '@/components/breadcrumb';
import { MobileHeader } from '@/components/layout/mobile-header';
import { Sidebar } from '@/components/layout/sidebar';
import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useBreakpoint } from '@/hooks/use-breakpoint';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useBreakpoint();

  return (
    <AuthGuard>
      <div className="flex h-screen flex-col lg:flex-row bg-background">
        {isDesktop ? <Sidebar /> : <MobileHeader />}
        <main className="flex-1 overflow-auto">
          <Breadcrumb />
          <div className="px-4 pb-4 lg:px-8 lg:pb-8">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}
