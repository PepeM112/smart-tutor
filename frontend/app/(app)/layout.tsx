import { MobileHeader } from '@/components/layout/MobileHeader';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/PageHeader';
import { AssistLayout } from '@/features/assist/components/AssistLayout';
import { AssistProvider } from '@/features/assist/context/AssistContext';
import { PageDataProvider } from '@/features/assist/context/PageDataContext';
import { AuthGuard } from '@/features/auth/components/AuthGuard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PageDataProvider>
        <AssistProvider>
          {/* The nav sits on the ground (`bg-background`). The page and the Ask AI sheet are sheets on it. */}
          <div className="flex h-dvh flex-col bg-background lg:flex-row">
            <div className="hidden lg:flex">
              <Sidebar />
            </div>
            <AssistLayout>
              {/* Flex column: the content area gets a definite height, so full-height pages
                  can use h-full. Normal pages grow and <main> scrolls, so their
                  scrollbar is at the sheet edge. A full-height page scrolls an inner element, which
                  cancels the padding below with `pageBleed` (src/lib/pageBleed.ts). */}
              <div className="flex h-full min-w-0 flex-col border-border bg-card lg:rounded-lg lg:border lg:shadow-card">
                <div className="hidden shrink-0 lg:block">
                  <PageHeader />
                </div>
                <div className="shrink-0 pt-[env(safe-area-inset-top)] lg:hidden">
                  <MobileHeader />
                </div>
                <main className="flex min-h-0 flex-1 flex-col overflow-auto">
                  <div className="flex-1 px-4 pt-4 pb-4 lg:px-8 lg:pt-6 lg:pb-8">{children}</div>
                </main>
              </div>
            </AssistLayout>
            <MobileTabBar />
          </div>
        </AssistProvider>
      </PageDataProvider>
    </AuthGuard>
  );
}
