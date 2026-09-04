'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { formatCost, formatTokens } from '@/lib/format';

type Props = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: string | null | undefined;
};

export function UsageTotals({ totalInputTokens, totalOutputTokens, totalEstimatedCost }: Props) {
  const t = useTranslations();

  const items = [
    { label: t('stats.total_input'), value: formatTokens(totalInputTokens) },
    { label: t('stats.total_output'), value: formatTokens(totalOutputTokens) },
    {
      label: t('stats.total_cost'),
      value: totalEstimatedCost ? formatCost(totalEstimatedCost) : '$0.00',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map(item => (
        <Card key={item.label}>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
