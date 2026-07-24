'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { FontSizePicker } from './font-size-picker';
import { ThemePicker } from './theme-picker';

export function AppearanceSection() {
  const t = useTranslations('settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ThemePicker />
        <FontSizePicker />
      </CardContent>
    </Card>
  );
}
