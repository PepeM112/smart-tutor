'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { AiProvider, type TokenUsageDailySummary } from '@/client';
import { useBreakpoint } from '@/hooks/use-breakpoint';

const PROVIDER_COLORS: Record<number, { fill: string; label: string }> = {
  [AiProvider.ANTHROPIC]: { fill: '#F97316', label: 'Anthropic' },
  [AiProvider.OPENAI]: { fill: '#3F3F46', label: 'OpenAI' },
};

type ChartDataPoint = {
  date: string;
  anthropic: number;
  openai: number;
  cumulative: number;
};

function buildChartData(daily: TokenUsageDailySummary[]): ChartDataPoint[] {
  const byDate = new Map<string, { anthropic: number; openai: number }>();

  daily.forEach(entry => {
    const dateStr = entry.date instanceof Date ? entry.date.toISOString().split('T')[0] : String(entry.date);

    const existing = byDate.get(dateStr) ?? { anthropic: 0, openai: 0 };
    const tokens = entry.inputTokens + entry.outputTokens;

    if (entry.provider === AiProvider.ANTHROPIC) {
      existing.anthropic += tokens;
    } else if (entry.provider === AiProvider.OPENAI) {
      existing.openai += tokens;
    }

    byDate.set(dateStr, existing);
  });

  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  let cumulative = 0;
  return sorted.map(([date, values]) => {
    cumulative += values.anthropic + values.openai;
    return {
      date,
      anthropic: values.anthropic,
      openai: values.openai,
      cumulative,
    };
  });
}

function formatDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${month}/${day}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

type Props = {
  daily: TokenUsageDailySummary[];
};

export function TokenUsageChart({ daily }: Props) {
  const t = useTranslations('dashboard');
  const { isMobile } = useBreakpoint();
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const data = useMemo(() => buildChartData(daily), [daily]);

  const toggleSeries = (dataKey: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(dataKey)) {
        next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  };

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('no_usage_data')}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 240 : 350}>
      <ComposedChart data={data} margin={{ top: 4, right: isMobile ? 4 : 8, left: isMobile ? -12 : 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          className="text-xs"
          tick={{ fontSize: isMobile ? 10 : 11 }}
          interval={isMobile ? 'preserveStartEnd' : undefined}
        />
        <YAxis
          yAxisId="daily"
          tickFormatter={formatTokens}
          className="text-xs"
          tick={{ fontSize: isMobile ? 10 : 11 }}
          width={isMobile ? 40 : 60}
        />
        {!isMobile && (
          <YAxis
            yAxisId="cumulative"
            orientation="right"
            tickFormatter={formatTokens}
            className="text-xs"
            tick={{ fontSize: 11 }}
          />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={label => formatDate(`${label as string | number}`)}
          formatter={(value, name) => {
            const numVal = Number(value);
            const nameStr = `${name as string}`;
            const providerLabel =
              nameStr === 'cumulative'
                ? t('cumulative')
                : (PROVIDER_COLORS[nameStr === 'anthropic' ? AiProvider.ANTHROPIC : AiProvider.OPENAI]?.label ??
                  nameStr);
            return [formatTokens(numVal), providerLabel];
          }}
        />
        <Legend
          onClick={e => {
            if (typeof e.dataKey === 'string') toggleSeries(e.dataKey);
          }}
          formatter={(value: string) => {
            const isHidden = hiddenSeries.has(value);
            const label = value === 'cumulative' ? t('cumulative') : value === 'anthropic' ? 'Anthropic' : 'OpenAI';
            return <span className={isHidden ? 'opacity-40' : ''}>{label}</span>;
          }}
          wrapperStyle={{ cursor: 'pointer', fontSize: isMobile ? 11 : 12 }}
        />
        <Bar
          yAxisId="daily"
          dataKey="anthropic"
          stackId="tokens"
          fill={PROVIDER_COLORS[AiProvider.ANTHROPIC].fill}
          hide={hiddenSeries.has('anthropic')}
          radius={[0, 0, 0, 0]}
        />
        <Bar
          yAxisId="daily"
          dataKey="openai"
          stackId="tokens"
          fill={PROVIDER_COLORS[AiProvider.OPENAI].fill}
          hide={hiddenSeries.has('openai')}
          radius={[2, 2, 0, 0]}
        />
        <Line
          yAxisId={isMobile ? 'daily' : 'cumulative'}
          dataKey="cumulative"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
          hide={hiddenSeries.has('cumulative')}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
