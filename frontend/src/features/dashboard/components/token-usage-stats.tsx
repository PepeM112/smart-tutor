'use client';

import { useTranslations } from 'next-intl';

type Props = {
  totalInputTokens: number;
  totalOutputTokens: number;
};

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function TokenUsageStats({ totalInputTokens, totalOutputTokens }: Props) {
  const t = useTranslations('dashboard');
  const total = totalInputTokens + totalOutputTokens;

  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label={t('total_tokens')} value={formatTokens(total)} />
      <StatCard label={t('input_tokens')} value={formatTokens(totalInputTokens)} />
      <StatCard label={t('output_tokens')} value={formatTokens(totalOutputTokens)} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
