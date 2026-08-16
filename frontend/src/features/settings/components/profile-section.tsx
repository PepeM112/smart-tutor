'use client';

import { useTranslations } from 'next-intl';

import { type UserRead } from '@/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { SettingsSection } from './settings-section';

import type { SettingsForm, UpdateField } from '../types';

type Props = {
  user: UserRead;
  form: Pick<SettingsForm, 'displayName'>;
  updateField: UpdateField;
};

export function ProfileSection({ user, form, updateField }: Props) {
  const t = useTranslations();

  return (
    <SettingsSection title={t('settings.profile')}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">{t('settings.display_name')}</Label>
          <Input
            id="displayName"
            placeholder={t('settings.display_name_placeholder')}
            value={form.displayName}
            onChange={e => updateField('displayName', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('settings.username')}</Label>
          <Input value={user.username} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>{t('settings.email')}</Label>
          <Input value={user.email} disabled />
        </div>
      </div>
    </SettingsSection>
  );
}
