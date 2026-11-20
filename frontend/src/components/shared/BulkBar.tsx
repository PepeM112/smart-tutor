'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface BulkBarProps {
  count: number;
  countLabel: string;
  onClear: () => void;
  /** The bulk action buttons. */
  children: ReactNode;
}

/** The bar that takes the place of the list toolbar while rows are selected. */
export function BulkBar({ count, countLabel, onClear, children }: BulkBarProps) {
  const t = useTranslations();
  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={t('common.bulk_actions')}
      className="flex min-h-12 flex-wrap items-center gap-2 py-2"
    >
      <span className="mr-1 text-sm font-medium text-foreground">{countLabel}</span>
      {children}
      <Button variant="ghost" icon={X} className="ml-auto text-muted-foreground" onClick={onClear}>
        {t('common.clear_selection')}
      </Button>
    </div>
  );
}
