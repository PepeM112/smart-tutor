'use client';

import {
  type ColumnDef,
  type Header as TanStackHeader,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { EllipsisVertical, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

import { toGroups } from '@/components/shared/actionGroups';
import { ActionsMenu, type MobileAction } from '@/components/shared/ActionsMenu';
import { type DescriptionField, MobileCard } from '@/components/shared/MobileCard';
import { SortableHeader, type SortDirection, type SortState } from '@/components/shared/SortableHeader';
import { RowEventBoundary } from '@/components/shared/tree/RowEventBoundary';
import { TreeActionsCell } from '@/components/shared/tree/TreeActionsCell';
import { ACTIONS_CELL_ONE_BUTTON_CLASS, ACTIONS_CELL_TWO_BUTTONS_CLASS } from '@/components/shared/tree/treeLayout';
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
  /**
   * The content that opens under a row (inline detail). Put `expandToggleColumn` in `columns` where the toggle goes.
   * Below the desktop breakpoint it is shown in the expanded card.
   */
  renderExpanded?: (row: T) => ReactNode;
  /** Stable id of a row. It is the row key and it is matched with `previewId`. */
  getRowId?: (row: T) => string;
  /** The row that is in the preview pane: it gets the highlight. */
  previewId?: string | null;
};

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
  renderExpanded,
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
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => !!renderExpanded,
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
          const groups = toGroups(renderActions?.(row.original) ?? []);
          const previewGroup: MobileAction[][] = onPreview
            ? [[{ label: t('common.preview'), icon: Eye, onClick: () => onPreview(row.original) }]]
            : [];

          return (
            <MobileCard
              key={row.id}
              data={row.original}
              preview={renderPreview(row.original)}
              expandable={expandable}
              actions={[...previewGroup, ...groups]}
              onRowClick={onRowClick}
              description={renderDescription?.(row.original) ?? undefined}
              renderExpandedContent={renderExpanded && (() => renderExpanded(row.original))}
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
  const visibleColumns = table.getVisibleLeafColumns();
  const leadingColumns = visibleColumns.slice(
    0,
    Math.max(
      0,
      visibleColumns.findIndex(c => c.columnDef.meta?.grow)
    )
  );
  const actionsWidthClass = renderActions && onPreview ? ACTIONS_CELL_TWO_BUTTONS_CLASS : ACTIONS_CELL_ONE_BUTTON_CLASS;

  return (
    // The hairlines are `divide-*` and not one-sided borders: the header, then each row, is separated from the next.
    <div data-slot="data-table" role="table" className="w-full divide-y divide-hairline">
      <div role="rowgroup">
        {table.getHeaderGroups().map(hg => (
          <div
            key={hg.id}
            role="row"
            className="flex min-h-9 items-center gap-2 px-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
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
      <div role="rowgroup" className="divide-y divide-hairline">
        {rows.flatMap(row => {
          const isPreviewed = previewId != null && getRowId?.(row.original) === previewId;
          const isOpen = row.getIsExpanded();
          const rowNode = (
            <div
              key={row.id}
              role="row"
              aria-selected={isPreviewed}
              className={cn(
                'group flex min-h-[52px] items-center gap-2 px-3 py-2 text-sm transition-colors',
                onRowClick && 'cursor-pointer',
                // The detail under an open row shares its tint and has no line between.
                isOpen && 'border-b-0',
                isPreviewed || isOpen ? 'bg-muted' : 'hover:bg-muted/60'
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
          if (!isOpen || !renderExpanded) return [rowNode];
          return [
            rowNode,
            <div key={`${row.id}-detail`} role="row" className="flex gap-2 bg-muted px-3">
              {/* Empty cells with the width of the columns before the title, so the detail lines up with it. */}
              {leadingColumns.map(column => (
                <div key={column.id} aria-hidden className={cellClass(column.columnDef.meta)} />
              ))}
              <div role="cell" className="min-w-0 flex-1 pt-1 pb-5">
                {renderExpanded(row.original)}
              </div>
            </div>,
          ];
        })}
      </div>
    </div>
  );
}

function cellClass(meta: ColumnDef<unknown, unknown>['meta']): string {
  return cn('min-w-0', meta?.grow ? 'flex-1' : 'w-28 shrink-0', meta?.widthClass);
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
