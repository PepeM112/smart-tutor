'use client';

import { CalendarDays, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { useDateTimePrefs } from '@/hooks/useDateTimePrefs';
import {
  dateFromDay,
  dayFromDate,
  formatDay,
  isSameDay,
  todayParts,
  type DateTimePrefs,
  type DayParts,
} from '@/lib/datetime';
import { type DateFilterValue } from '@/lib/filters';
import { cn } from '@/lib/utils';

import {
  PRESET_IDS,
  countDays,
  isRangeEqual,
  pickDay,
  presetRange,
  toDayRange,
  toFilterValue,
  type DayRange,
  type PresetId,
} from './dateRange';

interface DateRangeFieldProps {
  value: DateFilterValue | undefined;
  onChange: (value: DateFilterValue | undefined) => void;
}

/**
 * A trigger field that shows the range. It opens the presets and a month in its own popover.
 * The filter applies on each pick (like every other filter field), so there is no Done button:
 * the popover closes when the range is complete.
 */
export function DateRangeField({ value, onChange }: DateRangeFieldProps) {
  const t = useTranslations();
  const prefs = useDateTimePrefs();
  const today = todayParts(prefs.zone);
  const range = toDayRange(value, prefs.zone);
  const [isOpen, setIsOpen] = useState(false);
  // The URL-backed `value` can lag behind a click. The popover reads this draft, so the second click ends the range.
  const [draft, setDraft] = useState<DayRange>(range);
  const [month, setMonth] = useState<Date>(() => dateFromDay(range.from ?? today));
  const [hoverDay, setHoverDay] = useState<DayParts>();

  const handleOpenChange = (shouldOpen: boolean): void => {
    if (shouldOpen) {
      setDraft(range);
      setMonth(dateFromDay(range.from ?? today));
    }
    setIsOpen(shouldOpen);
  };

  const commit = (next: DayRange): void => {
    onChange(toFilterValue(next, prefs.zone));
    if (next.from && next.to) setIsOpen(false);
  };

  const handlePreset = (id: PresetId): void => commit(presetRange(id, today));

  const handleDayClick = (date: Date): void => {
    const next = pickDay(draft, dayFromDate(date));
    setDraft(next);
    commit(next);
  };

  const hasOpenRange = !!draft.from && !draft.to;
  const previewEnd = hasOpenRange && hoverDay ? dateFromDay(hoverDay) : undefined;

  return (
    <div data-slot="date-range-field" className="relative">
      <FloatingCard open={isOpen} onOpenChange={handleOpenChange}>
        <FloatingCardTrigger>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full justify-start font-normal', !value && 'text-muted-foreground', value && 'pr-9')}
          >
            <CalendarDays data-icon="inline-start" />
            <span className="truncate">{triggerText(range, prefs) ?? t('filters_date.any')}</span>
          </Button>
        </FloatingCardTrigger>
        <FloatingCardContent className="w-auto max-w-[calc(100vw-2rem)]" onMouseLeave={() => setHoverDay(undefined)}>
          <div className="flex flex-col gap-3">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {summary(draft, prefs, t)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_IDS.map(id => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={isRangeEqual(draft, presetRange(id, today))}
                  onClick={() => handlePreset(id)}
                  className={cn(
                    'rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted',
                    'aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary'
                  )}
                >
                  {t(`filters_date.${id}`)}
                </button>
              ))}
            </div>
            <Calendar
              mode="range"
              month={month}
              onMonthChange={setMonth}
              today={dateFromDay(today)}
              selected={draft.from && { from: dateFromDay(draft.from), to: dateFromDay(draft.to ?? draft.from) }}
              onDayClick={handleDayClick}
              onDayMouseEnter={date => setHoverDay(dayFromDate(date))}
              modifiers={{ preview: draft.from && previewEnd && { from: dateFromDay(draft.from), to: previewEnd } }}
              modifiersClassNames={{ preview: '[&>button]:border [&>button]:border-dashed [&>button]:border-primary' }}
              className="self-center"
            />
          </div>
        </FloatingCardContent>
      </FloatingCard>
      {value && (
        // Sibling of the trigger, not a child: a button inside a button is invalid HTML.
        <button
          type="button"
          aria-label={t('common.clear')}
          onClick={() => onChange(undefined)}
          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** "Nov 3, 2026 – Nov 14, 2026", one day as a single date, or `undefined` for no range. */
function triggerText(range: DayRange, prefs: DateTimePrefs): string | undefined {
  const show = (day: DayParts): string => formatDay(day, prefs);
  const { from, to } = range;
  if (from && to) return isSameDay(from, to) ? show(from) : `${show(from)} – ${show(to)}`;
  if (from) return `${show(from)} –`;
  if (to) return `– ${show(to)}`;
  return undefined;
}

function summary(range: DayRange, prefs: DateTimePrefs, t: ReturnType<typeof useTranslations>) {
  const show = (day: DayParts): string => formatDay(day, prefs);
  const { from, to } = range;
  if (from && to) {
    return t('filters_date.range', { from: show(from), to: show(to), count: countDays({ from, to }) });
  }
  if (from) return t('filters_date.from_open', { from: show(from) });
  if (to) return t('filters_date.until', { to: show(to) });
  return t('filters_date.any');
}
