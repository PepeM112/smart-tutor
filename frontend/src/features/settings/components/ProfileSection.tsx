'use client';

import { useTranslations } from 'next-intl';

import { type UserRead } from '@/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useAutoSaveField } from '../hooks/useAutoSaveField';
import { buildDisplayNamePatch } from '../utils';

import { AutoSaveForm } from './AutoSaveForm';
import { SettingsSection } from './SettingsSection';

type Props = {
  user: UserRead;
};

export function ProfileSection({ user }: Props) {
  const t = useTranslations();
  const displayName = useAutoSaveField(user.displayName ?? '', value => buildDisplayNamePatch(value, user));

  return (
    <SettingsSection title={t('settings.profile')}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">{t('settings.display_name')}</Label>
          <AutoSaveForm onSave={displayName.save}>
            <Input
              id="displayName"
              placeholder={t('settings.display_name_placeholder')}
              value={displayName.value}
              onChange={e => displayName.setValue(e.target.value)}
              onBlur={displayName.save}
            />
          </AutoSaveForm>
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
