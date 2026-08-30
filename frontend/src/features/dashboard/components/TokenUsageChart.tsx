'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';

import { AiProvider, type TokenUsageDailySummary } from '@/client';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { formatChartDate, formatCost, formatTokens } from '@/lib/format';

const PROVIDER_COLORS: Record<number, { fill: string; label: string }> = {
  [AiProvider.ANTHROPIC]: { fill: 'var(--chart-provider-anthropic)', label: 'Anthropic' },
  [AiProvider.OPENAI]: { fill: 'var(--chart-provider-openai)', label: 'OpenAI' },
};

type ChartDataPoint = {
  date: string;
  anthropic: number;
  openai: number;
  cumulative: number;
  anthropic_cost: number;
  openai_cost: number;
};

function buildChartData(daily: TokenUsageDailySummary[]): ChartDataPoint[] {
  const byDate = new Map<string, { anthropic: number; openai: number; anthropic_cost: number; openai_cost: number }>();

  daily.forEach(entry => {
    const dateStr = entry.date;

    const existing = byDate.get(dateStr) ?? { anthropic: 0, openai: 0, anthropic_cost: 0, openai_cost: 0 };
    const tokens = entry.inputTokens + entry.outputTokens;
    const cost = entry.estimatedCost ? parseFloat(entry.estimatedCost) : 0;

    if (entry.provider === AiProvider.ANTHROPIC) {
      existing.anthropic += tokens;
      existing.anthropic_cost += cost;
    } else if (entry.provider === AiProvider.OPENAI) {
      existing.openai += tokens;
      existing.openai_cost += cost;
    }

    byDate.set(dateStr, existing);
  });

  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  let cumulative = 0;
  return sorted.map(([date, values]) => {
    cumulative += values.anthropic + values.openai;
    return {
      date,
      ...values,
      cumulative,
    };
  });
}

type Props = {
  daily: TokenUsageDailySummary[];
};

export function TokenUsageChart({ daily }: Props) {
  const t = useTranslations();
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

  const renderTooltip = useCallback(
    (props: TooltipContentProps) => {
      if (!props.active || !props.payload?.length) return null;
      const sorted = [...props.payload].sort((a, b) => {
        const ka = String(a.dataKey);
        const kb = String(b.dataKey);
        if (ka === 'cumulative') return 1;
        if (kb === 'cumulative') return -1;
        return ka.localeCompare(kb);
      });
      const cumulativeIdx = sorted.findIndex(e => String(e.dataKey) === 'cumulative');
      return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs ring-1 ring-foreground/10">
          <p className="mb-1.5 font-medium">{formatChartDate(String(props.label))}</p>
          {sorted.map((entry, i) => {
            const key = String(entry.dataKey);
            const isCumulative = key === 'cumulative';
            const providerKey =
              key === 'anthropic' ? AiProvider.ANTHROPIC : key === 'openai' ? AiProvider.OPENAI : null;
            const seriesLabel = isCumulative
              ? t('dashboard.cumulative')
              : providerKey !== null
                ? PROVIDER_COLORS[providerKey].label
                : key;
            const dataPoint = entry.payload as Record<string, number> | undefined;
            const costValue = isCumulative ? undefined : dataPoint?.[`${key}_cost`];
            return (
              <div key={key}>
                {cumulativeIdx > 0 && i === cumulativeIdx && <div className="my-1 border-t border-border/50" />}
                <div className="flex items-center justify-between gap-6 py-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                    <span className="text-muted-foreground">{seriesLabel}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="font-medium">{formatTokens(Number(entry.value))}</span>
                    {costValue != null && costValue > 0 && (
                      <span className="text-muted-foreground">({formatCost(costValue)})</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    },
    [t]
  );

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('dashboard.no_usage_data')}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 240 : 350}>
      <ComposedChart data={data} margin={{ top: 4, right: isMobile ? 4 : 8, left: isMobile ? -12 : 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tickFormatter={formatChartDate}
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
        <Tooltip content={renderTooltip} />
        <Legend
          onClick={e => {
            if (typeof e.dataKey === 'string') toggleSeries(e.dataKey);
          }}
          formatter={(value: string) => {
            const isHidden = hiddenSeries.has(value);
            const providerKey =
              value === 'anthropic' ? AiProvider.ANTHROPIC : value === 'openai' ? AiProvider.OPENAI : null;
            const label = providerKey !== null ? PROVIDER_COLORS[providerKey].label : t('dashboard.cumulative');
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
        {/* On mobile the cumulative axis is hidden, so the line must attach to "daily" or Recharts can't plot */}
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
