'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExpandToggleProps {
  /** Names the row for screen readers. */
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
}

/** The chevron button that opens the detail under a `DataTableV2` row. */
export function ExpandToggle({ title, isExpanded, onToggle }: ExpandToggleProps) {
  const t = useTranslations();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground"
      aria-expanded={isExpanded}
      aria-label={t(isExpanded ? 'common.hide_details_for' : 'common.show_details_for', { title })}
      onClick={event => {
        // The row click opens the item; the toggle only opens the detail.
        event.stopPropagation();
        onToggle();
      }}
    >
      <ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} />
    </Button>
  );
}
