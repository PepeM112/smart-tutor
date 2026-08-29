'use client';

import { useTranslations } from 'next-intl';

import { FontSizePicker } from './FontSizePicker';
import { SettingsSection } from './SettingsSection';
import { ThemePicker } from './ThemePicker';

export function AppearanceSection() {
  const t = useTranslations();

  return (
    <SettingsSection title={t('settings.appearance')}>
      <div className="space-y-6">
        <ThemePicker />
        <FontSizePicker />
      </div>
    </SettingsSection>
  );
}
