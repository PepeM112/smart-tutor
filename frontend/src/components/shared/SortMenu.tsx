'use client';

import { ArrowDownUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type SortMenuOption<T extends string> = { value: T; label: string };

type Direction = 'asc' | 'desc';

type Props<T extends string> = {
  options: SortMenuOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Optional direction toggle. Leave it out when each option has a fixed direction
   * (for example "Newest" or "Most members").
   */
  direction?: Direction;
  onDirectionChange?: (direction: Direction) => void;
};

/** A button that shows the current sort and opens a menu with the sort options (for card grids, not tables). */
export function SortMenu<T extends string>({ options, value, onChange, direction, onDirectionChange }: Props<T>) {
  const t = useTranslations('common');
  const current = options.find(option => option.value === value);

  // The radio group gives a plain string. Find the option again, so no cast is necessary.
  const select = (next: string) => {
    const option = options.find(o => o.value === next);
    if (option) onChange(option.value);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={`${t('sort_by')}: ${current?.label ?? ''}`}>
          <ArrowDownUp data-icon="inline-start" />
          {current?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t('sort_by')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={select}>
          {options.map(option => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {direction && onDirectionChange && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={direction}
              onValueChange={next => onDirectionChange(next === 'asc' ? 'asc' : 'desc')}
            >
              <DropdownMenuRadioItem value="asc">{t('ascending')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">{t('descending')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
