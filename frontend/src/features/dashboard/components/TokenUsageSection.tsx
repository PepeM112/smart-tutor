'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { type AiFeature } from '@/client';
import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AI_FEATURE_LABEL_KEYS } from '@/lib/aiFeature';
import { sdk } from '@/lib/apiClient';
import { Routes } from '@/lib/routes';

import { TokenUsageChart } from './TokenUsageChart';
import { TokenUsageStats } from './TokenUsageStats';

const DEFAULT_RANGE = 30;

export function TokenUsageSection() {
  const t = useTranslations();
  const [days, setDays] = useState(DEFAULT_RANGE);

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
    queryKey: ['token-usage', days],
    queryFn: () => sdk.tokenUsageGetUsage({ query: { days } }),
    placeholderData: keepPreviousData,
  });

  const { data: featureData } = useQuery({
    queryKey: ['token-usage', days, 'feature'],
    queryFn: () => sdk.tokenUsageGetUsage({ query: { days, groupBy: 'feature' } }),
  });

  const usage = data?.data;

  const topFeature = useMemo(() => {
    const daily = featureData?.data?.daily;
    if (!daily?.length) return null;

    const totals = new Map<AiFeature, number>();
    daily.forEach(d => {
      if (!d.feature) return;
      totals.set(d.feature, (totals.get(d.feature) ?? 0) + d.inputTokens + d.outputTokens);
    });

    let bestFeature: AiFeature | null = null;
    let bestTokens = 0;
    totals.forEach((tokens, feature) => {
      if (tokens > bestTokens) {
        bestFeature = feature;
        bestTokens = tokens;
      }
    });
    return bestFeature;
  }, [featureData]);

  if (isLoading || !usage) return null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:space-y-0">
        <CardTitle>{t('dashboard.token_usage')}</CardTitle>
        <div className="flex items-center gap-3">
          <Link href={Routes.STATS} className="text-xs font-medium text-primary hover:underline">
            {t('dashboard.view_details')}
          </Link>
          <ButtonGroup value={days} onChange={setDays} items={timeRangeItems} size="sm" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`space-y-6 ${isFetching ? 'opacity-50 transition-opacity' : 'transition-opacity'}`}>
          <TokenUsageStats
            totalInputTokens={usage.totalInputTokens}
            totalOutputTokens={usage.totalOutputTokens}
            totalEstimatedCost={usage.totalEstimatedCost}
            topFeature={topFeature ? t(AI_FEATURE_LABEL_KEYS[topFeature]) : undefined}
          />
          <TokenUsageChart daily={usage.daily} />
        </div>
      </CardContent>
    </Card>
  );
}
