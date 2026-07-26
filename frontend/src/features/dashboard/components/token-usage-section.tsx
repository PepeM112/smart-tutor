'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sdk } from '@/lib/api-client';

import { TokenUsageChart } from './token-usage-chart';
import { TokenUsageStats } from './token-usage-stats';

const DAYS = 30;

export function TokenUsageSection() {
  const t = useTranslations('dashboard');

  const { data, isLoading } = useQuery({
    queryKey: ['token-usage', DAYS],
    queryFn: () => sdk.tokenUsageGetUsage({ query: { days: DAYS } }),
  });
  const usage = data?.data;

  if (isLoading || !usage) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('token_usage')}</CardTitle>
        <CardDescription>{t('last_n_days', { days: DAYS })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <TokenUsageStats totalInputTokens={usage.totalInputTokens} totalOutputTokens={usage.totalOutputTokens} />
        <TokenUsageChart daily={usage.daily} />
      </CardContent>
    </Card>
  );
}
