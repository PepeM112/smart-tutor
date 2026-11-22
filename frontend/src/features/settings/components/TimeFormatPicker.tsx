'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { type UserRead } from '@/client';
import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { useAuthStore } from '@/features/auth/store/authStore';

import { useDebouncedUpdateUser } from '../hooks/useDebouncedUpdateUser';

type TimeFormat = NonNullable<UserRead['timeFormat']>;

export function TimeFormatPicker() {
  const t = useTranslations();
  const labelId = useId();
  const current: TimeFormat = useAuthStore(s => s.user?.timeFormat) ?? '24h';
  const saveUser = useDebouncedUpdateUser();

  const items: ButtonGroupItem<TimeFormat>[] = [
    { value: '24h', label: t('settings.time_format_24h') },
    { value: '12h', label: t('settings.time_format_12h') },
  ];

  return (
    <div className="space-y-3">
      <h3 id={labelId} className="text-sm font-semibold text-foreground">
        {t('settings.time_format_label')}
      </h3>

      <ButtonGroup
        aria-labelledby={labelId}
        value={current}
        items={items}
        onChange={timeFormat => timeFormat !== current && saveUser({ timeFormat }, { field: 'timeFormat' })}
      />
    </div>
  );
}
