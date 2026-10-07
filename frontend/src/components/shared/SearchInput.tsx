'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Applied to the wrapper, so the parent controls the width. */
  className?: string;
};

/** Text input with a search icon, a clear button (when it has text) and Escape to clear. */
export function SearchInput({ value, onChange, placeholder, className }: Props) {
  const t = useTranslations();

  return (
    <div data-slot="search-input" className={cn('relative w-full', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 pr-8 pl-8"
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          // Escape clears the text. An empty input leaves the key to the page (a dialog, a pane).
          if (e.key === 'Escape' && value !== '') {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value !== '' && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
          aria-label={t('common.clear')}
          onClick={() => onChange('')}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
