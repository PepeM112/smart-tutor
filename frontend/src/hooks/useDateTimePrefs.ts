'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';

import { useAuthStore } from '@/features/auth/store/authStore';
import { createPrefs, type DateTimePrefs } from '@/lib/datetime';

/** The zone and clock format of the signed-in user. Before the user loads: browser zone, 24h. */
export function useDateTimePrefs(): DateTimePrefs {
  const timeFormat = useAuthStore(state => state.user?.timeFormat);
  const timezone = useAuthStore(state => state.user?.timezone);
  const locale = useLocale();

  return useMemo(() => createPrefs(timeFormat, timezone, locale), [timeFormat, timezone, locale]);
}
