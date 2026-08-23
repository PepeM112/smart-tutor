'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import type { AiFeature, AiProvider } from '@/client';
import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { sdk } from '@/lib/api-client';
import type { FilterValue, Primitive } from '@/lib/filters';

import { UsageChart } from './UsageChart';
import { UsageFilters } from './UsageFilters';
import { UsageTotals } from './UsageTotals';

import type { UsageGroupBy as GroupBy } from '../types';

export function UsageStatsPage() {
  const t = useTranslations();
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<GroupBy>('provider');
  const [filters, setFilters] = useState<FilterValue>({});

  const provider = useMemo(() => {
    const v = filters.provider as Primitive | undefined;
    return v != null ? (Number(v) as AiProvider) : null;
  }, [filters.provider]);

  const features = useMemo(() => {
    const v = filters.feature as Primitive[] | undefined;
    return v?.length ? (v.map(Number) as AiFeature[]) : null;
  }, [filters.feature]);

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
    queryKey: ['token-usage', days, groupBy, features, provider],
    queryFn: () =>
      sdk.tokenUsageGetUsage({
        query: {
          days,
          groupBy,
          feature: features ?? undefined,
          provider: provider ?? undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const handleFilterChange = useCallback((key: string, value: FilterValue[string] | undefined) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const handleClear = useCallback(() => setFilters({}), []);

  const usage = data?.data;
  const daily = useMemo(() => usage?.daily ?? [], [usage]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('stats.description')}</p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <UsageFilters
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClear={handleClear}
        />
        <ButtonGroup value={days} onChange={setDays} items={timeRangeItems} size="sm" />
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
            <UsageChart daily={daily} groupBy={groupBy} />
          </div>
        </div>
      )}
    </div>
  );
}
