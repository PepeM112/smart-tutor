'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sdk } from '@/lib/api-client';

import { TokenUsageChart } from './token-usage-chart';
import { TokenUsageStats } from './token-usage-stats';

const TIME_RANGES = [
  { key: 'range_1d', days: 1 },
  { key: 'range_1w', days: 7 },
  { key: 'range_1m', days: 30 },
  { key: 'range_3m', days: 90 },
  { key: 'range_1y', days: 365 },
] as const;

const DEFAULT_RANGE = 30;

export function TokenUsageSection() {
  const t = useTranslations('dashboard');
  const [days, setDays] = useState(DEFAULT_RANGE);

  const { data, isLoading } = useQuery({
    queryKey: ['token-usage', days],
    queryFn: () => sdk.tokenUsageGetUsage({ query: { days } }),
  });
  const usage = data?.data;

  if (isLoading || !usage) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{t('token_usage')}</CardTitle>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {TIME_RANGES.map(range => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                days === range.days
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(range.key)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <TokenUsageStats
          totalInputTokens={usage.totalInputTokens}
          totalOutputTokens={usage.totalOutputTokens}
          totalEstimatedCost={usage.totalEstimatedCost}
        />
        <TokenUsageChart daily={usage.daily} />
      </CardContent>
    </Card>
  );
}
