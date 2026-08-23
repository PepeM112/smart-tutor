'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { AiFeature } from '@/client';
import { AiProvider } from '@/client';
import { FilterPopover } from '@/components/shared/filters/filter-popover';
import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { AI_FEATURE_FILTER_OPTIONS } from '@/lib/ai-feature';
import { FilterType, type FilterEntity, type FilterItem, type FilterValue } from '@/lib/filters';

import type { UsageGroupBy as GroupBy } from '../types';

const ALL_PROVIDERS = 0;
type ProviderFilterValue = typeof ALL_PROVIDERS | AiProvider;

type Props = {
  groupBy: GroupBy;
  onGroupByChange: (value: GroupBy) => void;
  provider: AiProvider | null;
  onProviderChange: (value: AiProvider | null) => void;
  feature: AiFeature | null;
  onFeatureChange: (value: AiFeature | null) => void;
};

export function UsageFilters({
  groupBy,
  onGroupByChange,
  provider,
  onProviderChange,
  feature,
  onFeatureChange,
}: Props) {
  const t = useTranslations();

  const groupByItems: ButtonGroupItem<GroupBy>[] = useMemo(
    () => [
      { label: t('stats.group_provider'), value: 'provider' as GroupBy },
      { label: t('stats.group_feature'), value: 'feature' as GroupBy },
      { label: t('stats.group_both'), value: 'both' as GroupBy },
    ],
    [t]
  );

  const providerItems: ButtonGroupItem<ProviderFilterValue>[] = useMemo(
    () => [
      { label: t('stats.all_providers'), value: ALL_PROVIDERS },
      { label: t('settings.anthropic'), value: AiProvider.ANTHROPIC },
      { label: t('settings.openai'), value: AiProvider.OPENAI },
    ],
    [t]
  );

  const featureOptions: FilterEntity[] = useMemo(
    () => AI_FEATURE_FILTER_OPTIONS.map(opt => ({ label: opt.labelKey, value: opt.value })),
    []
  );

  const filterConfig: FilterItem[] = useMemo(
    () => [
      { label: t('stats.feature_filter'), key: 'feature', type: FilterType.SELECT, options: { items: featureOptions } },
    ],
    [t, featureOptions]
  );

  const filters: FilterValue = useMemo(() => {
    const value: FilterValue = {};
    if (feature != null) value.feature = feature;
    return value;
  }, [feature]);

  const handleFilterChange = (key: string, value: FilterValue[string] | undefined) => {
    if (key === 'feature') onFeatureChange(value == null ? null : (Number(value) as AiFeature));
  };

  const handleClear = () => {
    onFeatureChange(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <FilterPopover
        filterConfig={filterConfig}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('stats.provider_filter')}:</span>
        <ButtonGroup
          value={provider ?? ALL_PROVIDERS}
          onChange={v => onProviderChange(v === ALL_PROVIDERS ? null : v)}
          items={providerItems}
          size="sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('stats.group_by')}:</span>
        <ButtonGroup value={groupBy} onChange={onGroupByChange} items={groupByItems} size="sm" />
      </div>
    </div>
  );
}
