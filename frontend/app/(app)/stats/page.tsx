import { getTranslations } from 'next-intl/server';

import { SetBreadcrumb } from '@/components/breadcrumb';
import { UsageStatsPage } from '@/features/stats/components/UsageStatsPage';

export default async function StatsPage() {
  const t = await getTranslations('stats');

  return (
    <>
      <SetBreadcrumb title={t('title')} />
      <UsageStatsPage />
    </>
  );
}
