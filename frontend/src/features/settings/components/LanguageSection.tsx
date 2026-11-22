'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useTransition } from 'react';

import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { Label } from '@/components/ui/label';

import { useDebouncedUpdateUser } from '../hooks/useDebouncedUpdateUser';

import { SettingsSection } from './SettingsSection';

const LANGUAGES = [
  { value: 'en', labelKey: 'settings.english', flag: '🇬🇧' },
  { value: 'es', labelKey: 'settings.spanish', flag: '🇪🇸' },
] as const;

export function LanguageSection() {
  const t = useTranslations();
  const router = useRouter();
  const currentLocale = useLocale();
  const labelId = useId();
  const [, startTransition] = useTransition();
  const saveUser = useDebouncedUpdateUser();

  const items: ButtonGroupItem<string>[] = LANGUAGES.map(({ value, labelKey, flag }) => ({
    value,
    label: `${flag} ${t(labelKey)}`,
  }));

  // Server components read the locale from this cookie, so it is set before the refresh. The refresh
  // makes the page change language at once. The save of the profile follows after the delay.
  const showLocale = ({ locale }: { locale?: string }): void => {
    if (!locale) return;
    document.cookie = `locale=${locale};path=/;max-age=31536000`;
    startTransition(() => router.refresh());
  };

  return (
    <SettingsSection title={t('settings.language')} description={t('settings.language_description')}>
      <div className="space-y-3">
        <Label id={labelId}>{t('settings.language')}</Label>
        <ButtonGroup
          aria-labelledby={labelId}
          value={currentLocale}
          items={items}
          onChange={locale => locale !== currentLocale && saveUser({ locale }, { field: 'locale', show: showLocale })}
        />
      </div>
    </SettingsSection>
  );
}
