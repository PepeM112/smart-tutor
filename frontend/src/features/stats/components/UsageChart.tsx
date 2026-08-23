'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { AiFeature, AiProvider, type TokenUsageDailySummary } from '@/client';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { AI_FEATURE_LABEL_KEYS } from '@/lib/ai-feature';
import { formatTokens } from '@/lib/format';

type GroupBy = 'provider' | 'feature' | 'both';

const PROVIDER_COLORS: Record<number, string> = {
  [AiProvider.ANTHROPIC]: '#F97316',
  [AiProvider.OPENAI]: '#16B38C',
};

const PROVIDER_LABELS: Record<number, string> = {
  [AiProvider.ANTHROPIC]: 'Anthropic',
  [AiProvider.OPENAI]: 'OpenAI',
};

const FEATURE_COLORS: Record<number, string> = {
  [AiFeature.GRADING]: '#8B5CF6',
  [AiFeature.CHALLENGE]: '#EC4899',
  [AiFeature.NOTE_GENERATION]: '#06B6D4',
  [AiFeature.NOTE_REFINEMENT]: '#14B8A6',
  [AiFeature.TEST_GENERATION]: '#F59E0B',
  [AiFeature.ASSIST]: '#6366F1',
};

const BOTH_COLORS: Record<string, string> = {
  [`${AiProvider.ANTHROPIC}_${AiFeature.GRADING}`]: '#F97316',
  [`${AiProvider.ANTHROPIC}_${AiFeature.CHALLENGE}`]: '#FB923C',
  [`${AiProvider.ANTHROPIC}_${AiFeature.NOTE_GENERATION}`]: '#FDBA74',
  [`${AiProvider.ANTHROPIC}_${AiFeature.NOTE_REFINEMENT}`]: '#FED7AA',
  [`${AiProvider.ANTHROPIC}_${AiFeature.TEST_GENERATION}`]: '#C2410C',
  [`${AiProvider.ANTHROPIC}_${AiFeature.ASSIST}`]: '#EA580C',
  [`${AiProvider.OPENAI}_${AiFeature.GRADING}`]: '#16B38C',
  [`${AiProvider.OPENAI}_${AiFeature.CHALLENGE}`]: '#2DD4BF',
  [`${AiProvider.OPENAI}_${AiFeature.NOTE_GENERATION}`]: '#5EEAD4',
  [`${AiProvider.OPENAI}_${AiFeature.NOTE_REFINEMENT}`]: '#99F6E4',
  [`${AiProvider.OPENAI}_${AiFeature.TEST_GENERATION}`]: '#0D9488',
  [`${AiProvider.OPENAI}_${AiFeature.ASSIST}`]: '#0F766E',
};

type SeriesInfo = { key: string; label: string; color: string };

const ALL_FEATURES = [
  AiFeature.GRADING,
  AiFeature.CHALLENGE,
  AiFeature.NOTE_GENERATION,
  AiFeature.NOTE_REFINEMENT,
  AiFeature.TEST_GENERATION,
  AiFeature.ASSIST,
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

    if (groupBy === 'provider' && entry.provider != null) {
      const key = `p_${entry.provider}`;
      existing[key] = (existing[key] ?? 0) + tokens;
    } else if (groupBy === 'feature' && entry.feature != null) {
      const featureKey = entry.feature === AiFeature.NOTE_CHUNK_EDIT ? AiFeature.NOTE_REFINEMENT : entry.feature;
      const key = `f_${featureKey}`;
      existing[key] = (existing[key] ?? 0) + tokens;
    } else if (groupBy === 'both' && entry.provider != null && entry.feature != null) {
      const featureKey = entry.feature === AiFeature.NOTE_CHUNK_EDIT ? AiFeature.NOTE_REFINEMENT : entry.feature;
      const key = `pf_${entry.provider}_${featureKey}`;
      existing[key] = (existing[key] ?? 0) + tokens;
    }

    byDate.set(entry.date, existing);
  });

  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  let cumulative = 0;
  return sorted.map(([date, values]) => {
    const total = Object.values(values).reduce((sum, v) => sum + v, 0);
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

  // In "both" mode, only show series that have data to avoid a cluttered legend
  const visibleSeries = useMemo(() => {
    if (groupBy !== 'both') return uniqueSeries;
    const keysWithData = new Set(data.flatMap(row => Object.keys(row).filter(k => k.startsWith('pf_'))));
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

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('dashboard.no_usage_data')}</p>;
  }

  const seriesLabelMap = Object.fromEntries(visibleSeries.map(s => [s.key, s.label]));

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
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={label => formatDate(`${label as string | number}`)}
          formatter={(value, name) => {
            const nameStr = `${name as string}`;
            const label = nameStr === 'cumulative' ? t('dashboard.cumulative') : (seriesLabelMap[nameStr] ?? nameStr);
            return [formatTokens(Number(value)), label];
          }}
        />
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
