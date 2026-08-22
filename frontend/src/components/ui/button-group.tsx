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
  size?: 'xs' | 'sm' | 'default';
  disabled?: boolean;
  className?: string;
};

const sizeStyles = {
  xs: 'px-2 py-0.5 text-xs',
  sm: 'px-2.5 py-0.5 text-sm',
  default: 'px-3 py-1 text-sm',
} as const;

export function ButtonGroup<T extends string | number = string | number>({
  value,
  onChange,
  items,
  size = 'default',
  disabled,
  className,
}: Props<T>) {
  return (
    <div
      data-slot="button-group"
      className={cn(
        'inline-flex gap-0.5 rounded-md border border-border p-0.5',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {items.map(item => (
        <button
          key={String(item.value)}
          type="button"
          disabled={disabled || item.disabled}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-md font-medium transition-colors',
            'disabled:pointer-events-none disabled:opacity-50',
            sizeStyles[size],
            item.value === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
