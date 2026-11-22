'use client';

import { useRef } from 'react';

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
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

const sizeStyles = {
  xs: 'px-2 py-0.5 text-xs',
  sm: 'px-2.5 py-0.5 text-sm',
  default: 'px-3 py-1 text-sm',
} as const;

const ARROW_STEPS: Record<string, number | undefined> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function ButtonGroup<T extends string | number = string | number>({
  value,
  onChange,
  items,
  size = 'default',
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: Props<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const enabledItems = items.filter(item => !item.disabled);
  // Only the checked radio is a tab stop. When no item matches the value, the first enabled one is.
  const tabStop = enabledItems.find(item => item.value === value) ?? enabledItems[0];

  // Radio-group keyboard model: arrows move the choice and the focus, and wrap around. Tab leaves the group.
  const handleKeyDown = (event: React.KeyboardEvent): void => {
    const step = ARROW_STEPS[event.key];
    if (!step || disabled) return;
    const index = enabledItems.findIndex(item => item.value === value);
    const next = enabledItems[(index + step + enabledItems.length) % enabledItems.length];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    groupRef.current
      ?.querySelectorAll<HTMLElement>('[role="radio"]')
      .forEach(radio => radio.dataset.value === String(next.value) && radio.focus());
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      data-slot="button-group"
      className={cn(
        'inline-flex gap-0.5 rounded-md border border-border p-0.5',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      {items.map(item => (
        <button
          key={String(item.value)}
          type="button"
          role="radio"
          aria-checked={item.value === value}
          data-value={String(item.value)}
          tabIndex={item === tabStop ? 0 : -1}
          disabled={disabled || item.disabled}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-md font-medium transition-colors',
            'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-50',
            sizeStyles[size],
            item.value === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
