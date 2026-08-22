'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { AiFeature } from '@/client';
import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { AI_FEATURE_FILTER_OPTIONS } from '@/lib/ai-feature';

type GroupBy = 'provider' | 'feature' | 'both';

type Props = {
  groupBy: GroupBy;
  onGroupByChange: (value: GroupBy) => void;
  feature: AiFeature | null;
  onFeatureChange: (value: AiFeature | null) => void;
};

export function UsageFilters({ groupBy, onGroupByChange, feature, onFeatureChange }: Props) {
  const t = useTranslations();

  const groupByItems: ButtonGroupItem<GroupBy>[] = useMemo(
    () => [
      { label: t('stats.group_provider'), value: 'provider' as GroupBy },
      { label: t('stats.group_feature'), value: 'feature' as GroupBy },
      { label: t('stats.group_both'), value: 'both' as GroupBy },
    ],
    [t],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('stats.group_by')}:</span>
        <ButtonGroup value={groupBy} onChange={onGroupByChange} items={groupByItems} size="sm" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('stats.feature_filter')}:</span>
        <select
          value={feature ?? ''}
          onChange={e => {
            const val = e.target.value;
            onFeatureChange(val ? (Number(val) as AiFeature) : null);
          }}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-sm text-foreground"
        >
          <option value="">{t('stats.all_features')}</option>
          {AI_FEATURE_FILTER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
