import { Breadcrumb } from '@/components/breadcrumb';
import { Sidebar } from '@/components/layout/sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Breadcrumb />
        {children}
      </main>
    </div>
  );
}
