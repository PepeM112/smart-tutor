'use client';

import { useDateTimePrefs } from '@/hooks/useDateTimePrefs';
import { formatDate, type DateStyle } from '@/lib/datetime';

type Props = {
  value: Date | string;
  style?: DateStyle;
};

/** A date in the zone of the user. For a place that cannot call a hook (a table cell). */
export function FormattedDate({ value, style }: Props) {
  const prefs = useDateTimePrefs();
  return <>{formatDate(value, prefs, style)}</>;
}
