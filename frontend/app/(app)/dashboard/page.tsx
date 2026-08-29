import { getTranslations } from 'next-intl/server';

import { SetBreadcrumb } from '@/components/Breadcrumb';
import { TokenUsageSection } from '@/features/dashboard/components/token-usage-section';

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');

  return (
    <>
      <SetBreadcrumb title={t('title')} />
      <div className="space-y-6">
        <TokenUsageSection />
      </div>
    </>
  );
}
