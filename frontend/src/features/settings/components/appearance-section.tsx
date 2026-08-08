'use client';

import { useTranslations } from 'next-intl';

import { FontSizePicker } from './font-size-picker';
import { SettingsSection } from './settings-section';
import { ThemePicker } from './theme-picker';

export function AppearanceSection() {
  const t = useTranslations('settings');

  return (
    <SettingsSection title={t('appearance')}>
      <div className="space-y-6">
        <ThemePicker />
        <FontSizePicker />
      </div>
    </SettingsSection>
  );
}
