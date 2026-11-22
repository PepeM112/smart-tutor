'use client';

import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { TimePicker } from '@/components/ui/time-picker';
import { useDateTimePrefs } from '@/hooks/useDateTimePrefs';
import {
  dateFromDay,
  dayFromDate,
  formatDateTime,
  fromUtcIso,
  todayParts,
  toUtcIso,
  type WallTime,
} from '@/lib/datetime';
import { cn } from '@/lib/utils';

interface DateTimeFieldProps {
  /** Id of the trigger button, so a `<Label htmlFor>` names the field. */
  id?: string;
  /** A UTC ISO string, or `null` when empty. */
  value: string | null;
  /** Runs on Done and Clear, only when the instant changed. Closing the popup any other way drops the draft. */
  onCommit: (value: string | null) => void;
  className?: string;
}

/**
 * A date and time in the user's time zone and clock format. The value in and out is a UTC ISO string:
 * the zone only decides which wall time the person sees and types.
 */
function DateTimeField({ id, value, onCommit, className }: DateTimeFieldProps) {
  const t = useTranslations('common');
  const prefs = useDateTimePrefs();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<WallTime>(() => initialDraft(value, prefs.zone));

  const handleOpenChange = (shouldOpen: boolean): void => {
    if (shouldOpen) setDraft(initialDraft(value, prefs.zone));
    setIsOpen(shouldOpen);
  };

  const commit = (next: string | null): void => {
    setIsOpen(false);
    const isUnchanged = next === value || (next !== null && value !== null && Date.parse(next) === Date.parse(value));
    if (!isUnchanged) onCommit(next);
  };

  const draftIso = toUtcIso(draft, prefs.zone);

  return (
    <div data-slot="date-time-field">
      <FloatingCard open={isOpen} onOpenChange={handleOpenChange}>
        <FloatingCardTrigger>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn('w-full justify-start font-normal', !value && 'text-muted-foreground', className)}
          >
            <CalendarDays data-icon="inline-start" />
            {value ? formatDateTime(value, prefs) : t('pick_date_time')}
          </Button>
        </FloatingCardTrigger>
        <FloatingCardContent className="w-auto max-w-[calc(100vw-2rem)]">
          <div className="flex flex-wrap gap-4">
            <Calendar
              mode="single"
              required
              selected={dateFromDay(draft)}
              defaultMonth={dateFromDay(draft)}
              onSelect={date => setDraft(current => ({ ...current, ...dayFromDate(date) }))}
              today={dateFromDay(todayParts(prefs.zone))}
            />
            <TimePicker
              hour12={prefs.hour12}
              value={draft}
              onChange={time => setDraft(current => ({ ...current, ...time }))}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">{formatDateTime(draftIso, prefs)}</span>
            <div className="flex gap-2">
              {value && (
                <Button type="button" variant="ghost" size="sm" onClick={() => commit(null)}>
                  {t('clear')}
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => commit(draftIso)}>
                {t('done')}
              </Button>
            </div>
          </div>
        </FloatingCardContent>
      </FloatingCard>
    </div>
  );
}

/** An empty field starts at the current hour of today, so the first click on a day gives a usable time. */
function initialDraft(value: string | null, zone: string): WallTime {
  if (value) return fromUtcIso(value, zone);
  const now = fromUtcIso(new Date(), zone);
  return { ...now, minute: 0 };
}

export { DateTimeField };
