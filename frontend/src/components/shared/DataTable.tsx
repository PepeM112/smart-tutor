'use client';

import {
  type ColumnDef,
  type Header as TanStackHeader,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { type MobileAction } from '@/components/shared/ActionsMenu';
import { type DescriptionField, MobileCard } from '@/components/shared/MobileCard';
import { SortableHeader, type SortDirection, type SortState } from '@/components/shared/SortableHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBreakpoint } from '@/hooks/useBreakpoint';

export type { MobileAction };

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void | Promise<void>;
  renderPreview?: (row: T) => ReactNode;
  expandable?: boolean;
  renderActions?: (row: T) => MobileAction[];
  /** Paragraph-length field (e.g. a description) shown as its own wrapping block in the expanded mobile card. */
  renderDescription?: (row: T) => DescriptionField | null | undefined;
  sort?: SortState;
  onSort?: (column: string | null, order: SortDirection) => void;
};

export function DataTable<T>({
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
}: Props<T>) {
  const t = useTranslations();
  const { isDesktop } = useBreakpoint();
  const finalEmptyMessage = emptyMessage ?? t('common.no_data_found');

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const isEmpty = rows.length === 0;

  // Columns with meta.sortKey get a SortableHeader automatically; others render normally.
  function renderHeader<TData>(header: TanStackHeader<TData, unknown>) {
    if (header.isPlaceholder) return null;

    const meta = header.column.columnDef.meta as { label?: string; sortKey?: string } | undefined;
    if (meta?.sortKey && sort && onSort) {
      const label =
        meta.label ?? (typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : '');
      return <SortableHeader label={label} column={meta.sortKey} sort={sort} onSort={onSort} />;
    }

    return flexRender(header.column.columnDef.header, header.getContext());
  }

  if (!isDesktop && renderPreview) {
    if (isEmpty) {
      return <p className="py-12 text-center text-sm text-muted-foreground">{finalEmptyMessage}</p>;
    }

    return (
      <div data-slot="data-table" className="space-y-2">
        {rows.map(row => (
          <MobileCard
            key={row.id}
            data={row.original}
            preview={renderPreview(row.original)}
            expandable={expandable}
            actions={renderActions?.(row.original)}
            onRowClick={onRowClick}
            description={renderDescription?.(row.original) ?? undefined}
            cells={row
              .getVisibleCells()
              .filter(cell => !(cell.column.columnDef.meta as { hideOnMobile?: boolean } | undefined)?.hideOnMobile)
              .map(cell => ({
                id: cell.id,
                headerLabel:
                  (cell.column.columnDef.meta as { label?: string } | undefined)?.label ??
                  (typeof cell.column.columnDef.header === 'string' ? cell.column.columnDef.header : null),
                content: flexRender(cell.column.columnDef.cell, cell.getContext()),
              }))}
          />
        ))}
      </div>
    );
  }

  return (
    <div data-slot="data-table" className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(hg => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map(header => (
                <TableHead key={header.id}>{renderHeader(header)}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isEmpty ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {finalEmptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map(row => (
              <TableRow
                key={row.id}
                className={onRowClick ? 'cursor-pointer' : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
