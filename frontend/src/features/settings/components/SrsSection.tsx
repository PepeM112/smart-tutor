'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type UserRead } from '@/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useUpdateUser } from '../hooks/useUpdateUser';
import { buildDailyLimitPatch, buildEaseFactorPatch, DEFAULT_EASE_FACTOR } from '../utils';

import { SettingsSection } from './SettingsSection';

type Props = {
  user: UserRead;
};

export function SrsSection({ user }: Props) {
  const t = useTranslations();
  const [dailyReviewLimit, setDailyReviewLimit] = useState(
    user.dailyReviewLimit != null ? String(user.dailyReviewLimit) : ''
  );
  const [initialEaseFactor, setInitialEaseFactor] = useState(String(user.initialEaseFactor ?? DEFAULT_EASE_FACTOR));
  const { mutate: saveDailyReviewLimit } = useUpdateUser();
  const { mutate: saveInitialEaseFactor } = useUpdateUser();

  const saveLimitOnBlur = (): void => {
    const patch = buildDailyLimitPatch(dailyReviewLimit, user);
    if (patch) saveDailyReviewLimit(patch);
  };
  const saveEaseOnBlur = (): void => {
    const patch = buildEaseFactorPatch(initialEaseFactor, user);
    if (patch) saveInitialEaseFactor(patch);
  };

  return (
    <SettingsSection title={t('settings.srs_preferences')} description={t('settings.srs_description')}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dailyReviewLimit">{t('settings.daily_review_limit')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.daily_review_limit_description')}</p>
          <Input
            id="dailyReviewLimit"
            type="number"
            min={1}
            placeholder={t('settings.unlimited')}
            value={dailyReviewLimit}
            onChange={e => setDailyReviewLimit(e.target.value)}
            onBlur={saveLimitOnBlur}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="initialEaseFactor">{t('settings.initial_ease_factor')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.initial_ease_factor_description')}</p>
          <Input
            id="initialEaseFactor"
            type="number"
            min={1.3}
            max={5.0}
            step={0.1}
            value={initialEaseFactor}
            onChange={e => setInitialEaseFactor(e.target.value)}
            onBlur={saveEaseOnBlur}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
