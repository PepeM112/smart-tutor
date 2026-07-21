'use client';

import { useTranslations } from 'next-intl';

import { type UserRead } from '@/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { SettingsForm, UpdateField } from '../types';

type Props = {
  user: UserRead;
  form: Pick<SettingsForm, 'displayName'>;
  updateField: UpdateField;
};

export function ProfileSection({ user, form, updateField }: Props) {
  const t = useTranslations('settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">{t('display_name')}</Label>
          <Input
            id="displayName"
            placeholder={t('display_name_placeholder')}
            value={form.displayName}
            onChange={e => updateField('displayName', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('username')}</Label>
          <Input value={user.username} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>{t('email')}</Label>
          <Input value={user.email} disabled />
        </div>
      </CardContent>
    </Card>
  );
}
