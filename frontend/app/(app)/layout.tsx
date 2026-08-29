import { Breadcrumb } from '@/components/Breadcrumb';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { Sidebar } from '@/components/layout/Sidebar';
import { AssistDockedWrapper } from '@/features/assist/components/AssistDockedWrapper';
import { AssistPanel } from '@/features/assist/components/AssistPanel';
import { AssistProvider } from '@/features/assist/context/AssistContext';
import { PageDataProvider } from '@/features/assist/context/PageDataContext';
import { AuthGuard } from '@/features/auth/components/AuthGuard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PageDataProvider>
        <AssistProvider>
          <div className="flex h-screen flex-col lg:flex-row bg-background">
            <div className="hidden lg:flex">
              <Sidebar />
            </div>
            <div className="lg:hidden">
              <MobileHeader />
            </div>
            <main className="min-w-0 flex-1 overflow-auto">
              <Breadcrumb />
              <div className="px-4 pb-4 lg:px-8 lg:pb-8">{children}</div>
            </main>
            <AssistDockedWrapper />
          </div>
          <AssistPanel />
        </AssistProvider>
      </PageDataProvider>
    </AuthGuard>
  );
}
