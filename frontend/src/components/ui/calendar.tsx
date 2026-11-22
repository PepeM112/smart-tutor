'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { DayPicker, type ChevronProps } from 'react-day-picker';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CalendarProps = React.ComponentProps<typeof DayPicker>;

// One band strip per day cell. A range start only paints its right half and an end only its left half,
// so the band joins the round day buttons. A one-day range has both halves: zero width, no band.
const BAND =
  'before:absolute before:inset-x-0 before:inset-y-0.5 before:bg-primary/15 first:before:rounded-l-lg last:before:rounded-r-lg';
const SELECTED_BUTTON =
  '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground';

/**
 * Month grid for picking a day or a range. It works with browser-local `Date`s: convert from and to a
 * zone with `dateFromDay` / `dayFromDate` and pass the user-zone day as `today`.
 *
 * The week starts on Monday (ISO 8601) in every locale. This matches the design, keeps the range band
 * in the same place for both app languages and needs no per-locale week table: the `locale` option of
 * react-day-picker takes date-fns locale objects, which would add every imported locale to the bundle.
 * Pass `weekStartsOn` to override it.
 */
function Calendar({ className, classNames, weekStartsOn = 1, formatters, labels, ...props }: CalendarProps) {
  const locale = useLocale();
  const t = useTranslations('common');
  const isRange = props.mode === 'range';

  return (
    <DayPicker
      data-slot="calendar"
      weekStartsOn={weekStartsOn}
      fixedWeeks
      className={cn('relative w-72 select-none', className)}
      classNames={{
        months: 'flex flex-col',
        month: 'flex flex-col',
        nav: 'absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between',
        button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' })),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' })),
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'font-serif text-base font-medium text-foreground',
        month_grid: 'mt-2 w-full table-fixed border-collapse',
        weekday: 'h-7 text-center text-xs font-medium text-muted-foreground',
        day: 'relative h-9 p-0 text-center text-sm',
        day_button:
          'relative z-10 mx-auto flex size-8 cursor-pointer items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
        today: '[&>button]:font-bold [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-rule',
        disabled: 'opacity-35',
        // In range mode every day of the range is "selected": only the two ends look selected.
        selected: isRange ? '' : SELECTED_BUTTON,
        range_start: cn(BAND, 'before:left-1/2', SELECTED_BUTTON),
        range_middle: BAND,
        range_end: cn(BAND, 'before:right-1/2', SELECTED_BUTTON),
        ...classNames,
      }}
      components={{ Chevron: CalendarChevron }}
      formatters={{
        formatCaption: month => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month),
        formatWeekdayName: day => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day),
        ...formatters,
      }}
      labels={{ labelPrevious: () => t('previous_month'), labelNext: () => t('next_month'), ...labels }}
      {...props}
    />
  );
}

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
  return <Icon className={cn('size-4', className)} />;
}

export { Calendar };
