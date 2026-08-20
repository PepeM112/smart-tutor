'use client';

import { cn } from '@/lib/utils';

export type ButtonGroupItem<T extends string | number = string | number> = {
  label: string;
  value: T;
  disabled?: boolean;
};

type Props<T extends string | number = string | number> = {
  value: T;
  onChange: (value: T) => void;
  items: ButtonGroupItem<T>[];
  disabled?: boolean;
  className?: string;
};

export function ButtonGroup<T extends string | number = string | number>({
  value,
  onChange,
  items,
  disabled,
  className,
}: Props<T>) {
  return (
    <div
      data-slot="button-group"
      className={cn(
        'inline-flex gap-1 rounded-lg border border-input bg-background p-1 dark:bg-input/30',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      {items.map(item => (
        <button
          key={String(item.value)}
          type="button"
          disabled={disabled || item.disabled}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-md px-3 py-1 text-sm font-medium transition-colors',
            'disabled:pointer-events-none disabled:opacity-50',
            item.value === value
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
