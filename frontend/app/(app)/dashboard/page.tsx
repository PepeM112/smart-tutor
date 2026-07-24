import { getTranslations } from 'next-intl/server';

import { SetBreadcrumb } from '@/components/breadcrumb';

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');

  return (
    <>
      <SetBreadcrumb title={t('title')} />
      <p className="text-muted-foreground">{t('overview_placeholder')}</p>
    </>
  );
}
