'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { to12Hour } from '@/lib/datetime';
import { cn } from '@/lib/utils';

interface TimeOfDay {
  /** 0–23, always the 24h value. */
  hour: number;
  minute: number;
}

interface TimePickerProps {
  value: TimeOfDay;
  onChange: (value: TimeOfDay) => void;
  /** Shows hours 1–12 and an AM/PM column instead of hours 0–23. */
  hour12?: boolean;
  className?: string;
}

interface ColumnOption {
  value: number;
  label: string;
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const pad = (n: number): string => String(n).padStart(2, '0');

const HOURS_24: ColumnOption[] = range(0, 23).map(value => ({ value, label: pad(value) }));
const HOURS_12: ColumnOption[] = range(1, 12).map(value => ({ value, label: String(value) }));
const MINUTES: ColumnOption[] = range(0, 59).map(value => ({ value, label: pad(value) }));
const MERIDIEMS: ColumnOption[] = [
  { value: 0, label: 'AM' },
  { value: 1, label: 'PM' },
];

/** Hour, minute and AM/PM as three short lists. Each list stops at its ends: 23 does not roll over to 0. */
function TimePicker({ value, onChange, hour12 = false, className }: TimePickerProps) {
  const t = useTranslations('common');
  const isPm = value.hour >= 12;

  const handleHour = (selected: number): void => {
    // In 12h the column holds 1–12: 12 is hour 0 (AM) or 12 (PM).
    const hour = hour12 ? (selected % 12) + (isPm ? 12 : 0) : selected;
    onChange({ ...value, hour });
  };
  const handleMeridiem = (meridiem: number): void => onChange({ ...value, hour: (value.hour % 12) + meridiem * 12 });

  return (
    <div data-slot="time-picker" className={cn('flex gap-1', className)}>
      <TimeColumn
        label={t('hour')}
        options={hour12 ? HOURS_12 : HOURS_24}
        selected={hour12 ? to12Hour(value.hour) : value.hour}
        onSelect={handleHour}
      />
      <TimeColumn
        label={t('minute')}
        options={MINUTES}
        selected={value.minute}
        onSelect={minute => onChange({ ...value, minute })}
      />
      {hour12 && (
        <TimeColumn
          label={t('am_pm')}
          options={MERIDIEMS}
          selected={isPm ? 1 : 0}
          onSelect={handleMeridiem}
          className="w-16"
        />
      )}
    </div>
  );
}

interface TimeColumnProps {
  label: string;
  options: ColumnOption[];
  selected: number;
  onSelect: (value: number) => void;
  className?: string;
}

function TimeColumn({ label, options, selected, onSelect, className }: TimeColumnProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const baseId = React.useId();
  const optionId = (value: number): string => `${baseId}-${value}`;

  // Center the selected item when the list opens, then only keep it in view.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && item) list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
  }, []);

  React.useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !item) return;
    const itemBottom = item.offsetTop + item.offsetHeight;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (itemBottom > list.scrollTop + list.clientHeight) list.scrollTop = itemBottom - list.clientHeight;
  }, [selected]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const index = options.findIndex(option => option.value === selected);
    const lastIndex = options.length - 1;
    const nextIndex: Record<string, number> = {
      ArrowUp: Math.max(index - 1, 0),
      ArrowDown: Math.min(index + 1, lastIndex),
      Home: 0,
      End: lastIndex,
    };
    const next = nextIndex[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (next !== index) onSelect(options[next].value);
  };

  return (
    <div className={cn('flex w-15 flex-col gap-1', className)}>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={optionId(selected)}
        onKeyDown={handleKeyDown}
        className="relative h-58 overflow-y-auto rounded-lg border border-border p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map(option => (
          <div
            key={option.value}
            id={optionId(option.value)}
            role="option"
            aria-selected={option.value === selected}
            onClick={() => onSelect(option.value)}
            className="flex h-8 cursor-pointer items-center justify-center rounded-md text-sm tabular-nums transition-colors hover:bg-muted aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary"
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export { TimePicker };
export type { TimeOfDay };
