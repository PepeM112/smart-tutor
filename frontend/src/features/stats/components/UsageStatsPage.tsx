'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import type { AiFeature } from '@/client';
import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { sdk } from '@/lib/api-client';

import { UsageChart } from './UsageChart';
import { UsageFilters } from './UsageFilters';
import { UsageTotals } from './UsageTotals';

type GroupBy = 'provider' | 'feature' | 'both';

export function UsageStatsPage() {
  const t = useTranslations();
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<GroupBy>('provider');
  const [feature, setFeature] = useState<AiFeature | null>(null);

  const timeRangeItems: ButtonGroupItem<number>[] = useMemo(
    () => [
      { label: t('dashboard.range_1d'), value: 1 },
      { label: t('dashboard.range_1w'), value: 7 },
      { label: t('dashboard.range_1m'), value: 30 },
      { label: t('dashboard.range_3m'), value: 90 },
      { label: t('dashboard.range_1y'), value: 365 },
    ],
    [t]
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['token-usage', days, groupBy, feature],
    queryFn: () =>
      sdk.tokenUsageGetUsage({
        query: {
          days,
          groupBy,
          feature: feature ?? undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const usage = data?.data;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('stats.description')}</p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ButtonGroup value={days} onChange={setDays} items={timeRangeItems} size="sm" />
        <UsageFilters groupBy={groupBy} onGroupByChange={setGroupBy} feature={feature} onFeatureChange={setFeature} />
      </div>

      {isLoading || !usage ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      ) : (
        <div className={isFetching ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          <div className="space-y-6">
            <UsageTotals
              totalInputTokens={usage.totalInputTokens}
              totalOutputTokens={usage.totalOutputTokens}
              totalEstimatedCost={usage.totalEstimatedCost}
            />
            <UsageChart daily={usage.daily} groupBy={groupBy} />
          </div>
        </div>
      )}
    </div>
  );
}
