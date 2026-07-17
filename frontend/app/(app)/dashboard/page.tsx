import { SetBreadcrumb } from '@/components/breadcrumb';

export default function DashboardPage() {
  return (
    <>
      <SetBreadcrumb title="Dashboard" />
      <p className="text-muted-foreground">Your learning overview will appear here.</p>
    </>
  );
}
