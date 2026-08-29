'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { AiProvider } from '@/client';
import { FilterPopover } from '@/components/shared/filters/FilterPopover';
import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { AI_FEATURE_FILTER_OPTIONS } from '@/lib/ai-feature';
import { FilterType, type FilterEntity, type FilterItem, type FilterValue } from '@/lib/filters';

import type { UsageGroupBy as GroupBy } from '../types';

const PROVIDER_OPTIONS: FilterEntity[] = [
  { label: 'settings.anthropic', value: String(AiProvider.ANTHROPIC) },
  { label: 'settings.openai', value: String(AiProvider.OPENAI) },
];

type Props = {
  groupBy: GroupBy;
  onGroupByChange: (value: GroupBy) => void;
  filters: FilterValue;
  onFilterChange: (key: string, value: FilterValue[string] | undefined) => void;
  onClear: () => void;
};

export function UsageFilters({ groupBy, onGroupByChange, filters, onFilterChange, onClear }: Props) {
  const t = useTranslations();

  const groupByItems: ButtonGroupItem<GroupBy>[] = useMemo(
    () => [
      { label: t('stats.group_provider'), value: 'provider' as GroupBy },
      { label: t('stats.group_feature'), value: 'feature' as GroupBy },
      { label: t('stats.group_both'), value: 'both' as GroupBy },
    ],
    [t]
  );

  const featureOptions: FilterEntity[] = useMemo(
    () => AI_FEATURE_FILTER_OPTIONS.map(opt => ({ label: opt.labelKey, value: opt.value })),
    []
  );

  const filterConfig: FilterItem[] = useMemo(
    () => [
      {
        label: t('stats.provider_filter'),
        key: 'provider',
        type: FilterType.TOGGLE,
        options: { items: PROVIDER_OPTIONS },
      },
      {
        label: t('stats.feature_filter'),
        key: 'feature',
        type: FilterType.MULTIPLE_SELECT,
        options: { items: featureOptions, number: true },
      },
    ],
    [t, featureOptions]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <FilterPopover filterConfig={filterConfig} filters={filters} onFilterChange={onFilterChange} onClear={onClear} />
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('stats.group_by')}:</span>
        <ButtonGroup value={groupBy} onChange={onGroupByChange} items={groupByItems} size="sm" />
      </div>
    </div>
  );
}
