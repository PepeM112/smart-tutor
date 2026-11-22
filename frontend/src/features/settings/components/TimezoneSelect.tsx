'use client';

import { useTranslations } from 'next-intl';
import { useId, useMemo } from 'react';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/features/auth/store/authStore';

import { useDebouncedUpdateUser } from '../hooks/useDebouncedUpdateUser';

// A Radix item cannot have an empty value, so "no zone saved" (null on the backend) uses this sentinel.
const AUTOMATIC = 'automatic';

function listTimezones(savedZone: string | null | undefined): string[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  // Some engines leave UTC out of the list, and an old saved zone can be missing from a newer one.
  return [...new Set(['UTC', ...(savedZone ? [savedZone] : []), ...supported])].sort();
}

export function TimezoneSelect() {
  const t = useTranslations();
  const id = useId();
  const savedZone = useAuthStore(s => s.user?.timezone);
  const saveUser = useDebouncedUpdateUser();

  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const zones = useMemo(() => listTimezones(savedZone), [savedZone]);

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{t('settings.timezone_label')}</Label>
      {/* Radix Select has no search box, but typing the start of a name jumps to it (for example "Eur"). */}
      <Select
        value={savedZone || AUTOMATIC}
        onValueChange={value => saveUser({ timezone: value === AUTOMATIC ? null : value }, { field: 'timezone' })}
      >
        <SelectTrigger id={id} className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTOMATIC}>{t('settings.timezone_automatic', { zone: browserZone })}</SelectItem>
          {zones.map(zone => (
            <SelectItem key={zone} value={zone}>
              {zone}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
