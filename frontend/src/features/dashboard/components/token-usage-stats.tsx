'use client';

import { useTranslations } from 'next-intl';

import { formatTokens } from '@/lib/format';

type Props = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: string | null;
  topFeature?: string;
};

// Show more decimal places below $1 so small AI costs don't all round to $0.00
function formatCost(value: string): string {
  const num = parseFloat(value);
  if (num >= 1) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(4)}`;
}

export function TokenUsageStats({ totalInputTokens, totalOutputTokens, totalEstimatedCost, topFeature }: Props) {
  const t = useTranslations();
  const total = totalInputTokens + totalOutputTokens;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <StatCard label={t('dashboard.total_tokens')} value={formatTokens(total)} />
      <StatCard
        label={t('dashboard.estimated_cost')}
        value={totalEstimatedCost ? formatCost(totalEstimatedCost) : '—'}
      />
      <StatCard label={t('dashboard.input_tokens')} value={formatTokens(totalInputTokens)} />
      {topFeature ? (
        <StatCard label={t('dashboard.top_feature')} value={topFeature} />
      ) : (
        <StatCard label={t('dashboard.output_tokens')} value={formatTokens(totalOutputTokens)} />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}
