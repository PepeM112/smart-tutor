'use client';

import { SetBreadcrumb } from '@/components/breadcrumb';
import { FontSizePicker } from '@/features/settings/components/font-size-picker';
import { ThemePicker } from '@/features/settings/components/theme-picker';

export default function SettingsPage() {
  return (
    <>
      <SetBreadcrumb title="Profile & Settings" />

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Appearance</h2>
          <ThemePicker />
          <div className="mt-6">
            <FontSizePicker />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Account</h2>
          <p className="text-muted-foreground text-sm">Account settings and SRS preferences coming soon.</p>
        </section>
      </div>
    </>
  );
}
