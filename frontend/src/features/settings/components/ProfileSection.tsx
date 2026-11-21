'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type UserRead } from '@/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useUpdateUser } from '../hooks/useUpdateUser';
import { buildDisplayNamePatch } from '../utils';

import { SettingsSection } from './SettingsSection';

type Props = {
  user: UserRead;
};

export function ProfileSection({ user }: Props) {
  const t = useTranslations();
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const { mutate: saveDisplayName } = useUpdateUser();

  const saveOnBlur = (): void => {
    const patch = buildDisplayNamePatch(displayName, user);
    if (patch) saveDisplayName(patch);
  };

  return (
    <SettingsSection title={t('settings.profile')}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">{t('settings.display_name')}</Label>
          <Input
            id="displayName"
            placeholder={t('settings.display_name_placeholder')}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            onBlur={saveOnBlur}
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
