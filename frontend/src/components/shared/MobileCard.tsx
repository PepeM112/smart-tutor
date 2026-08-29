'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { ActionsMenu, type MobileAction } from '@/components/shared/ActionsMenu';
import { cn } from '@/lib/utils';

export type CellData = {
  id: string;
  headerLabel: ReactNode;
  content: ReactNode;
};

export type DescriptionField = {
  label: ReactNode;
  value: ReactNode;
};

export type MobileCardProps<T> = {
  data: T;
  preview: ReactNode;
  expandable: boolean;
  actions?: MobileAction[];
  onRowClick?: (row: T) => void | Promise<void>;
  cells: CellData[];
  /** A paragraph-length field (e.g. a description) shown as its own wrapping block, distinct from the short key/value grid. */
  description?: DescriptionField;
};

export function MobileCard<T>({
  data,
  preview,
  expandable,
  actions,
  onRowClick,
  cells,
  description,
}: MobileCardProps<T>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasActions = actions && actions.length > 0;
  const isClickable = expandable || !!onRowClick;

  function handleCardClick() {
    if (expandable) setIsExpanded(prev => !prev);
    else if (onRowClick) void onRowClick(data);
  }

  const expandableCells = cells.filter(cell => cell.headerLabel != null && cell.headerLabel !== '');

  return (
    <div data-slot="mobile-card" className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <div
        className={cn('flex items-center gap-3 p-3', isClickable && 'cursor-pointer active:bg-muted/50')}
        onClick={handleCardClick}
      >
        {expandable && (
          <ChevronDown
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
          />
        )}
        <div className="flex-1 min-w-0">{preview}</div>
        {hasActions && <ActionsMenu actions={actions} />}
      </div>

      {expandable && isExpanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {description && (
            <div>
              <dt className="text-xs text-muted-foreground mb-1">{description.label}</dt>
              <dd className="text-sm whitespace-pre-wrap">{description.value}</dd>
            </div>
          )}
          <dl className="space-y-2">
            {expandableCells.map(cell => (
              <div key={cell.id} className="flex items-baseline justify-between gap-4">
                <dt className="text-xs text-muted-foreground shrink-0">{cell.headerLabel}</dt>
                <dd className="text-sm text-right">{cell.content}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
