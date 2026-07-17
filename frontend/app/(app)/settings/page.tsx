import { SetBreadcrumb } from '@/components/breadcrumb';

export default function SettingsPage() {
  return (
    <>
      <SetBreadcrumb title="Profile & Settings" />
      <p className="text-muted-foreground">Account settings and SRS preferences.</p>
    </>
  );
}
