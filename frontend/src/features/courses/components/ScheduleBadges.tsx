'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SpaceItemRead } from '@/client';
import { useDateTimePrefs } from '@/hooks/useDateTimePrefs';
import { formatDateTime } from '@/lib/datetime';

import { scheduleLabels } from '../lib/schedule';

/** "Scheduled", "Due", "Opens" and "Closes" lines of an item, as small text after the title. */
export function ScheduleBadges({ item, isAuthor }: { item: SpaceItemRead; isAuthor: boolean }) {
  const t = useTranslations();
  const prefs = useDateTimePrefs();
  // One clock reading per mount: a date that passes shows after the next refetch.
  const [now] = useState(() => new Date());

  const labels = scheduleLabels(item, now, isAuthor);
  if (labels.length === 0) return null;

  return (
    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline" data-testid="schedule-badges">
      {labels
        .map(label =>
          t(`courses.schedule_label_${label.kind}`, {
            date: formatDateTime(label.date, prefs, 'short'),
          })
        )
        .join(' · ')}
    </span>
  );
}
