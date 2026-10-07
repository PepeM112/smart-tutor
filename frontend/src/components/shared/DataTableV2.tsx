'use client';

import {
  type ColumnDef,
  type Header as TanStackHeader,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { EllipsisVertical, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

import { ActionsMenu, type MobileAction } from '@/components/shared/ActionsMenu';
import { type DescriptionField, MobileCard } from '@/components/shared/MobileCard';
import { SortableHeader, type SortDirection, type SortState } from '@/components/shared/SortableHeader';
import { RowEventBoundary } from '@/components/shared/tree/RowEventBoundary';
import { TreeActionsCell } from '@/components/shared/tree/TreeActionsCell';
import { Button } from '@/components/ui/button';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';

export type { MobileAction };

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void | Promise<void>;
  /** The summary of a row in the mobile card. With it, the table is a list of cards below the desktop breakpoint. */
  renderPreview?: (row: T) => ReactNode;
  expandable?: boolean;
  /** One flat list, or groups split by a separator (destructive action last). */
  renderActions?: (row: T) => MobileAction[] | MobileAction[][];
  /** Paragraph-length field (e.g. a description) shown as its own wrapping block in the expanded mobile card. */
  renderDescription?: (row: T) => DescriptionField | null | undefined;
  sort?: SortState;
  onSort?: (column: string | null, order: SortDirection) => void;
  /** Adds an Eye button to each row (and a Preview entry in the mobile card menu). */
  onPreview?: (row: T) => void;
  /** Stable id of a row. It is the row key and it is matched with `previewId`. */
  getRowId?: (row: T) => string;
  /** The row that is in the preview pane: it gets the highlight. */
  previewId?: string | null;
};

// Eye button + `⋮` menu, each `size-7` (28px) with a 2px gap.
const ONE_BUTTON_WIDTH_CLASS = 'w-7';
const TWO_BUTTONS_WIDTH_CLASS = 'w-15';

function cellClass(meta: ColumnDef<unknown, unknown>['meta']): string {
  return cn('min-w-0', meta?.grow ? 'flex-1' : 'w-28 shrink-0', meta?.widthClass);
}

/**
 * Data table with the look of the Files tree: a small header, dense rows, and a hover actions
 * cell with an optional Eye (preview) button and a `⋮` menu. Columns are TanStack `ColumnDef`s;
 * `meta.widthClass` sets the width, `meta.grow` marks the flexible column, `meta.sortKey` makes the
 * header sortable. Below the desktop breakpoint it shows `MobileCard`s when `renderPreview` is set.
 */
export function DataTableV2<T>({
  columns,
  data,
  emptyMessage,
  onRowClick,
  renderPreview,
  expandable = true,
  renderActions,
  renderDescription,
  sort,
  onSort,
  onPreview,
  getRowId,
  previewId,
}: Props<T>) {
  const t = useTranslations();
  const { isDesktop } = useBreakpoint();
  const finalEmptyMessage = emptyMessage ?? t('common.no_data_found');

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId ? row => getRowId(row) : undefined,
  });

  const rows = table.getRowModel().rows;
  const isEmpty = rows.length === 0;

  // Columns with meta.sortKey get a SortableHeader automatically; others render normally.
  function renderHeader<TData>(header: TanStackHeader<TData, unknown>) {
    if (header.isPlaceholder) return null;

    const meta = header.column.columnDef.meta;
    if (meta?.sortKey && sort && onSort) {
      const label =
        meta.label ?? (typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : '');
      return <SortableHeader compact label={label} column={meta.sortKey} sort={sort} onSort={onSort} />;
    }

    return flexRender(header.column.columnDef.header, header.getContext());
  }

  if (isEmpty) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{finalEmptyMessage}</p>;
  }

  if (!isDesktop && renderPreview) {
    return (
      <div data-slot="data-table" className="space-y-2">
        {rows.map(row => {
          const actions = renderActions?.(row.original) ?? [];
          const groups = Array.isArray(actions[0]) ? (actions as MobileAction[][]) : [actions as MobileAction[]];
          const previewGroup: MobileAction[][] = onPreview
            ? [[{ label: t('common.preview'), icon: Eye, onClick: () => onPreview(row.original) }]]
            : [];

          return (
            <MobileCard
              key={row.id}
              data={row.original}
              preview={renderPreview(row.original)}
              expandable={expandable}
              actions={[...previewGroup, ...groups].filter(group => group.length > 0)}
              onRowClick={onRowClick}
              description={renderDescription?.(row.original) ?? undefined}
              cells={row
                .getVisibleCells()
                .filter(cell => !cell.column.columnDef.meta?.hideOnMobile)
                .map(cell => ({
                  id: cell.id,
                  headerLabel:
                    cell.column.columnDef.meta?.label ??
                    (typeof cell.column.columnDef.header === 'string' ? cell.column.columnDef.header : null),
                  content: flexRender(cell.column.columnDef.cell, cell.getContext()),
                }))}
            />
          );
        })}
      </div>
    );
  }

  const hasActionsCell = !!renderActions || !!onPreview;
  const actionsWidthClass = renderActions && onPreview ? TWO_BUTTONS_WIDTH_CLASS : ONE_BUTTON_WIDTH_CLASS;

  return (
    <div data-slot="data-table" role="table" className="w-full">
      <div role="rowgroup">
        {table.getHeaderGroups().map(hg => (
          <div
            key={hg.id}
            role="row"
            className="flex items-center gap-2 border-b border-border py-1 pl-2 pr-2 text-xs font-medium text-muted-foreground"
          >
            {hg.headers.map(header => (
              <div key={header.id} role="columnheader" className={cellClass(header.column.columnDef.meta)}>
                {renderHeader(header)}
              </div>
            ))}
            {hasActionsCell && <span className={cn(actionsWidthClass, 'shrink-0')} />}
          </div>
        ))}
      </div>
      <div role="rowgroup" className="py-1">
        {rows.map(row => {
          const isPreviewed = previewId != null && getRowId?.(row.original) === previewId;
          return (
            <div
              key={row.id}
              role="row"
              aria-selected={isPreviewed}
              className={cn(
                'group flex items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-sm transition-colors',
                onRowClick && 'cursor-pointer',
                isPreviewed ? 'bg-muted' : 'hover:bg-accent/30'
              )}
              onClick={onRowClick ? () => void onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map(cell => (
                <div key={cell.id} role="cell" className={cellClass(cell.column.columnDef.meta)}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
              {hasActionsCell && (
                <RowActions
                  widthClass={actionsWidthClass}
                  actions={renderActions?.(row.original)}
                  onPreview={onPreview ? () => onPreview(row.original) : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type RowActionsProps = {
  widthClass: string;
  actions?: MobileAction[] | MobileAction[][];
  onPreview?: () => void;
};

function RowActions({ widthClass, actions, onPreview }: RowActionsProps) {
  const t = useTranslations();
  // The cell shows only on hover. Keep it visible while the menu is open.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <RowEventBoundary>
      <TreeActionsCell widthClass={widthClass} forceVisible={menuOpen}>
        {onPreview && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            tooltip={t('common.preview')}
            aria-label={t('common.preview')}
            onClick={onPreview}
          >
            <Eye className="size-4" />
          </Button>
        )}
        {actions && (
          <ActionsMenu
            actions={actions}
            onOpenChange={setMenuOpen}
            trigger={
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('common.action')}>
                <EllipsisVertical className="size-4" />
              </Button>
            }
          />
        )}
      </TreeActionsCell>
    </RowEventBoundary>
  );
}
