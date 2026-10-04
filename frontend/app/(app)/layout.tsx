import { MobileHeader } from '@/components/layout/MobileHeader';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/PageHeader';
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
            {/* Flex column: the content area gets a definite height, so full-height pages
                (FilePageShell) can use h-full. Normal pages grow and <main> scrolls, so their
                scrollbar is at the page edge. A full-height page scrolls an inner element, which
                cancels the padding below with `pageBleed` (src/lib/pageBleed.ts). */}
            <main className="flex min-w-0 flex-1 flex-col overflow-auto">
              <PageHeader />
              <div className="flex-1 px-4 pb-4 lg:px-8 lg:pb-8">{children}</div>
            </main>
            <AssistDockedWrapper />
          </div>
          <AssistPanel />
        </AssistProvider>
      </PageDataProvider>
    </AuthGuard>
  );
}
