import { SetBreadcrumb } from '@/components/breadcrumb';

export default function StatsPage() {
  return (
    <>
      <SetBreadcrumb title="Progress Stats" />
      <p className="text-muted-foreground">Charts and streaks will be displayed here.</p>
    </>
  );
}
