'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SpaceItemRead } from '@/client';

import { scheduleLabels } from '../lib/schedule';

/** "Scheduled", "Due", "Opens" and "Closes" lines of an item, as small text after the title. */
export function ScheduleBadges({ item, isAuthor }: { item: SpaceItemRead; isAuthor: boolean }) {
  const t = useTranslations();
  const format = useFormatter();
  // One clock reading per mount: a date that passes shows after the next refetch.
  const [now] = useState(() => new Date());

  const labels = scheduleLabels(item, now, isAuthor);
  if (labels.length === 0) return null;

  return (
    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline" data-testid="schedule-badges">
      {labels
        .map(label =>
          t(`courses.schedule_label_${label.kind}`, {
            date: format.dateTime(label.date, { dateStyle: 'short', timeStyle: 'short' }),
          })
        )
        .join(' · ')}
    </span>
  );
}
