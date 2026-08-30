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

import { AiFeature, AiProvider, type TokenUsageDailySummary } from '@/client';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { AI_FEATURE_LABEL_KEYS } from '@/lib/aiFeature';
import { formatCost, formatTokens } from '@/lib/format';

import type { UsageGroupBy as GroupBy } from '../types';

const PROVIDER_COLORS: Record<number, string> = {
  [AiProvider.ANTHROPIC]: 'var(--chart-provider-anthropic)',
  [AiProvider.OPENAI]: 'var(--chart-provider-openai)',
};

const PROVIDER_LABELS: Record<number, string> = {
  [AiProvider.ANTHROPIC]: 'Anthropic',
  [AiProvider.OPENAI]: 'OpenAI',
};

const FEATURE_COLORS: Record<number, string> = {
  [AiFeature.GRADING]: 'var(--chart-feature-grading)',
  [AiFeature.CHALLENGE]: 'var(--chart-feature-challenge)',
  [AiFeature.NOTE_GENERATION]: 'var(--chart-feature-note-generation)',
  [AiFeature.NOTE_REFINEMENT]: 'var(--chart-feature-note-refinement)',
  [AiFeature.TEST_GENERATION]: 'var(--chart-feature-test-generation)',
  [AiFeature.ASSIST]: 'var(--chart-feature-assist)',
  [AiFeature.EMBEDDING]: 'var(--chart-feature-embedding)',
};

const BOTH_COLORS: Record<string, string> = {
  [`${AiProvider.ANTHROPIC}_${AiFeature.GRADING}`]: 'var(--chart-both-anthropic-grading)',
  [`${AiProvider.ANTHROPIC}_${AiFeature.CHALLENGE}`]: 'var(--chart-both-anthropic-challenge)',
  [`${AiProvider.ANTHROPIC}_${AiFeature.NOTE_GENERATION}`]: 'var(--chart-both-anthropic-note-generation)',
  [`${AiProvider.ANTHROPIC}_${AiFeature.NOTE_REFINEMENT}`]: 'var(--chart-both-anthropic-note-refinement)',
  [`${AiProvider.ANTHROPIC}_${AiFeature.TEST_GENERATION}`]: 'var(--chart-both-anthropic-test-generation)',
  [`${AiProvider.ANTHROPIC}_${AiFeature.ASSIST}`]: 'var(--chart-both-anthropic-assist)',
  [`${AiProvider.ANTHROPIC}_${AiFeature.EMBEDDING}`]: 'var(--chart-both-anthropic-embedding)',
  [`${AiProvider.OPENAI}_${AiFeature.GRADING}`]: 'var(--chart-both-openai-grading)',
  [`${AiProvider.OPENAI}_${AiFeature.CHALLENGE}`]: 'var(--chart-both-openai-challenge)',
  [`${AiProvider.OPENAI}_${AiFeature.NOTE_GENERATION}`]: 'var(--chart-both-openai-note-generation)',
  [`${AiProvider.OPENAI}_${AiFeature.NOTE_REFINEMENT}`]: 'var(--chart-both-openai-note-refinement)',
  [`${AiProvider.OPENAI}_${AiFeature.TEST_GENERATION}`]: 'var(--chart-both-openai-test-generation)',
  [`${AiProvider.OPENAI}_${AiFeature.ASSIST}`]: 'var(--chart-both-openai-assist)',
  [`${AiProvider.OPENAI}_${AiFeature.EMBEDDING}`]: 'var(--chart-both-openai-embedding)',
};

type SeriesInfo = { key: string; label: string; color: string };

const ALL_FEATURES = [
  AiFeature.GRADING,
  AiFeature.CHALLENGE,
  AiFeature.NOTE_GENERATION,
  AiFeature.NOTE_REFINEMENT,
  AiFeature.TEST_GENERATION,
  AiFeature.ASSIST,
  AiFeature.EMBEDDING,
];

const ALL_PROVIDERS = [AiProvider.ANTHROPIC, AiProvider.OPENAI];

function getSeriesForGroupBy(groupBy: GroupBy, t: (key: string) => string): SeriesInfo[] {
  if (groupBy === 'provider') {
    return ALL_PROVIDERS.map(p => ({
      key: `p_${p}`,
      label: PROVIDER_LABELS[p],
      color: PROVIDER_COLORS[p],
    }));
  }

  if (groupBy === 'feature') {
    return ALL_FEATURES.map(f => ({
      key: `f_${f}`,
      label: t(AI_FEATURE_LABEL_KEYS[f]),
      color: FEATURE_COLORS[f],
    }));
  }

  // "both" — provider × feature composite keys
  return ALL_PROVIDERS.flatMap(p =>
    ALL_FEATURES.map(f => ({
      key: `pf_${p}_${f}`,
      label: `${PROVIDER_LABELS[p]} · ${t(AI_FEATURE_LABEL_KEYS[f])}`,
      color: BOTH_COLORS[`${p}_${f}`] ?? FEATURE_COLORS[f],
    }))
  );
}

function buildChartData(daily: TokenUsageDailySummary[], groupBy: GroupBy): Record<string, string | number>[] {
  const byDate = new Map<string, Record<string, number>>();

  daily.forEach(entry => {
    const existing = byDate.get(entry.date) ?? {};
    const tokens = entry.inputTokens + entry.outputTokens;
    const cost = entry.estimatedCost ? parseFloat(entry.estimatedCost) : 0;

    let key: string | undefined;
    if (groupBy === 'provider' && entry.provider != null) {
      key = `p_${entry.provider}`;
    } else if (groupBy === 'feature' && entry.feature != null) {
      const featureKey = entry.feature === AiFeature.NOTE_CHUNK_EDIT ? AiFeature.NOTE_REFINEMENT : entry.feature;
      key = `f_${featureKey}`;
    } else if (groupBy === 'both' && entry.provider != null && entry.feature != null) {
      const featureKey = entry.feature === AiFeature.NOTE_CHUNK_EDIT ? AiFeature.NOTE_REFINEMENT : entry.feature;
      key = `pf_${entry.provider}_${featureKey}`;
    }

    if (key) {
      existing[key] = (existing[key] ?? 0) + tokens;
      existing[`${key}_cost`] = (existing[`${key}_cost`] ?? 0) + cost;
    }

    byDate.set(entry.date, existing);
  });

  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  let cumulative = 0;
  return sorted.map(([date, values]) => {
    const total = Object.entries(values)
      .filter(([k]) => !k.endsWith('_cost'))
      .reduce((sum, [, v]) => sum + v, 0);
    cumulative += total;
    return { date, ...values, cumulative };
  });
}

function formatDate(dateStr: string): string {
  if (dateStr.includes(':')) return dateStr;
  const [, month, day] = dateStr.split('-');
  return `${month}/${day}`;
}

type Props = {
  daily: TokenUsageDailySummary[];
  groupBy: GroupBy;
};

export function UsageChart({ daily, groupBy }: Props) {
  const t = useTranslations();
  const { isMobile } = useBreakpoint();
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const series = useMemo(() => getSeriesForGroupBy(groupBy, t), [groupBy, t]);
  const data = useMemo(() => buildChartData(daily, groupBy), [daily, groupBy]);

  // Deduplicate series with the same key (NOTE_REFINEMENT and NOTE_CHUNK_EDIT share a key)
  const uniqueSeries = useMemo(() => {
    const seen = new Set<string>();
    return series.filter(s => {
      if (seen.has(s.key)) return false;
      seen.add(s.key);
      return true;
    });
  }, [series]);

  const visibleSeries = useMemo(() => {
    const prefixes: Record<GroupBy, string> = { provider: 'p_', feature: 'f_', both: 'pf_' };
    const prefix = prefixes[groupBy];
    const keysWithData = new Set(
      data.flatMap(row =>
        Object.entries(row)
          .filter(([k, v]) => k.startsWith(prefix) && !k.endsWith('_cost') && (v as number) > 0)
          .map(([k]) => k)
      )
    );
    return uniqueSeries.filter(s => keysWithData.has(s.key));
  }, [uniqueSeries, data, groupBy]);

  const toggleSeries = (dataKey: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  };

  const seriesLabelMap = useMemo(() => Object.fromEntries(visibleSeries.map(s => [s.key, s.label])), [visibleSeries]);

  const renderTooltip = useCallback(
    (props: TooltipContentProps) => {
      if (!props.active || !props.payload?.length) return null;
      const sorted = [...props.payload]
        .filter(entry => !String(entry.dataKey).endsWith('_cost'))
        .sort((a, b) => {
          const ka = String(a.dataKey);
          const kb = String(b.dataKey);
          if (ka === 'cumulative') return 1;
          if (kb === 'cumulative') return -1;
          const la = seriesLabelMap[ka] ?? ka;
          const lb = seriesLabelMap[kb] ?? kb;
          return la.localeCompare(lb);
        });
      const cumulativeIdx = sorted.findIndex(e => String(e.dataKey) === 'cumulative');
      return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs ring-1 ring-foreground/10">
          <p className="mb-1.5 font-medium">{formatDate(String(props.label))}</p>
          {sorted.map((entry, i) => {
            const key = String(entry.dataKey);
            const isCumulative = key === 'cumulative';
            const seriesLabel = isCumulative ? t('dashboard.cumulative') : (seriesLabelMap[key] ?? key);
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
                      <span className="text-muted-foreground">({formatCost(String(costValue))})</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    },
    [seriesLabelMap, t]
  );

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('dashboard.no_usage_data')}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 400}>
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
        <Tooltip content={renderTooltip} />
        <Legend
          onClick={e => {
            if (typeof e.dataKey === 'string') toggleSeries(e.dataKey);
          }}
          formatter={(value: string) => {
            const isHidden = hiddenSeries.has(value);
            const label = value === 'cumulative' ? t('dashboard.cumulative') : (seriesLabelMap[value] ?? value);
            return <span className={isHidden ? 'opacity-40' : ''}>{label}</span>;
          }}
          wrapperStyle={{ cursor: 'pointer', fontSize: isMobile ? 11 : 12 }}
        />
        {visibleSeries.map((s, i) => (
          <Bar
            key={s.key}
            yAxisId="daily"
            dataKey={s.key}
            stackId="tokens"
            fill={s.color}
            hide={hiddenSeries.has(s.key)}
            radius={i === visibleSeries.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
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
