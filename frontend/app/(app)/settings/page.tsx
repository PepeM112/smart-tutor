import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { SetBreadcrumb } from '@/components/PageHeader';
import { SettingsPage as SettingsContent } from '@/features/settings/components/SettingsPage';

export default async function SettingsPage() {
  const t = await getTranslations('settings');

  return (
    <>
      <SetBreadcrumb title={t('title')} />
      <Suspense>
        <SettingsContent />
      </Suspense>
    </>
  );
}
