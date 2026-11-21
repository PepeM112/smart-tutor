'use client';

import { useTranslations } from 'next-intl';

import { type UserRead } from '@/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useAutoSaveField } from '../hooks/useAutoSaveField';
import { buildDailyLimitPatch, buildEaseFactorPatch, DEFAULT_EASE_FACTOR } from '../utils';

import { AutoSaveForm } from './AutoSaveForm';
import { SettingsSection } from './SettingsSection';

type Props = {
  user: UserRead;
};

export function SrsSection({ user }: Props) {
  const t = useTranslations();
  const dailyReviewLimit = useAutoSaveField(user.dailyReviewLimit != null ? String(user.dailyReviewLimit) : '', value =>
    buildDailyLimitPatch(value, user)
  );
  const initialEaseFactor = useAutoSaveField(String(user.initialEaseFactor ?? DEFAULT_EASE_FACTOR), value =>
    buildEaseFactorPatch(value, user)
  );

  return (
    <SettingsSection title={t('settings.srs_preferences')} description={t('settings.srs_description')}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dailyReviewLimit">{t('settings.daily_review_limit')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.daily_review_limit_description')}</p>
          <AutoSaveForm onSave={dailyReviewLimit.save}>
            <Input
              id="dailyReviewLimit"
              type="number"
              min={1}
              placeholder={t('settings.unlimited')}
              value={dailyReviewLimit.value}
              onChange={e => dailyReviewLimit.setValue(e.target.value)}
              onBlur={dailyReviewLimit.save}
            />
          </AutoSaveForm>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="initialEaseFactor">{t('settings.initial_ease_factor')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.initial_ease_factor_description')}</p>
          <AutoSaveForm onSave={initialEaseFactor.save}>
            <Input
              id="initialEaseFactor"
              type="number"
              min={1.3}
              max={5.0}
              step={0.1}
              value={initialEaseFactor.value}
              onChange={e => initialEaseFactor.setValue(e.target.value)}
              onBlur={initialEaseFactor.save}
            />
          </AutoSaveForm>
        </div>
      </div>
    </SettingsSection>
  );
}
