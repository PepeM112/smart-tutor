import { getTranslations } from 'next-intl/server';

import { SetBreadcrumb } from '@/components/Breadcrumb';
import { SettingsPage as SettingsContent } from '@/features/settings/components/SettingsPage';

export default async function SettingsPage() {
  const t = await getTranslations('settings');

  return (
    <>
      <SetBreadcrumb title={t('title')} />
      <SettingsContent />
    </>
  );
}
