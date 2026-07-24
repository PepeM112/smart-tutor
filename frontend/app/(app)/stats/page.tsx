import { getTranslations } from 'next-intl/server';

import { SetBreadcrumb } from '@/components/breadcrumb';

export default async function StatsPage() {
  const t = await getTranslations('stats');

  return (
    <>
      <SetBreadcrumb title={t('title')} />
      <p className="text-muted-foreground">{t('placeholder')}</p>
    </>
  );
}
