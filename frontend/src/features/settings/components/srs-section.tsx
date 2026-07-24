'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { SettingsForm, UpdateField } from '../types';

type Props = {
  form: Pick<SettingsForm, 'dailyReviewLimit' | 'initialEaseFactor'>;
  updateField: UpdateField;
};

export function SrsSection({ form, updateField }: Props) {
  const t = useTranslations('settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('srs_preferences')}</CardTitle>
        <CardDescription>{t('srs_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dailyReviewLimit">{t('daily_review_limit')}</Label>
          <p className="text-xs text-muted-foreground">{t('daily_review_limit_description')}</p>
          <Input
            id="dailyReviewLimit"
            type="number"
            min={1}
            placeholder={t('unlimited')}
            value={form.dailyReviewLimit}
            onChange={e => updateField('dailyReviewLimit', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="initialEaseFactor">{t('initial_ease_factor')}</Label>
          <p className="text-xs text-muted-foreground">{t('initial_ease_factor_description')}</p>
          <Input
            id="initialEaseFactor"
            type="number"
            min={1.3}
            max={5.0}
            step={0.1}
            value={form.initialEaseFactor}
            onChange={e => updateField('initialEaseFactor', e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
