'use client';

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronDown, EllipsisVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';

export type MobileAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'destructive';
  node?: ReactNode;
  confirm?: {
    title: string;
    description: string;
  };
};

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void | Promise<void>;
  renderPreview?: (row: T) => ReactNode;
  expandable?: boolean;
  renderActions?: (row: T) => MobileAction[];
};

export function DataTable<T>({
  columns,
  data,
  emptyMessage,
  onRowClick,
  renderPreview,
  expandable = true,
  renderActions,
}: Props<T>) {
  const t = useTranslations('common');
  const { isDesktop } = useBreakpoint();
  const finalEmptyMessage = emptyMessage ?? t('no_data_found');

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const isEmpty = rows.length === 0;

  if (!isDesktop && renderPreview) {
    if (isEmpty) {
      return <p className="py-12 text-center text-sm text-muted-foreground">{finalEmptyMessage}</p>;
    }

    return (
      <div className="space-y-2">
        {rows.map(row => (
          <MobileCard
            key={row.id}
            data={row.original}
            preview={renderPreview(row.original)}
            expandable={expandable}
            actions={renderActions?.(row.original)}
            onRowClick={onRowClick}
            cells={row.getVisibleCells().map(cell => ({
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
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(hg => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map(header => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
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

type CellData = {
  id: string;
  headerLabel: ReactNode;
  content: ReactNode;
};

type MobileCardProps<T> = {
  data: T;
  preview: ReactNode;
  expandable: boolean;
  actions?: MobileAction[];
  onRowClick?: (row: T) => void | Promise<void>;
  cells: CellData[];
};

function MobileCard<T>({ data, preview, expandable, actions, onRowClick, cells }: MobileCardProps<T>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasActions = actions && actions.length > 0;
  const isClickable = expandable || !!onRowClick;

  function handleCardClick() {
    if (expandable) setIsExpanded(prev => !prev);
    else if (onRowClick) void onRowClick(data);
  }

  const expandableCells = cells.filter(cell => cell.headerLabel != null && cell.headerLabel !== '');

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
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
        <div className="border-t border-border px-4 py-3">
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

function ActionsMenu({ actions }: { actions: MobileAction[] }) {
  const [pendingConfirm, setPendingConfirm] = useState<MobileAction | null>(null);

  return (
    <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" className="text-muted-foreground">
              <EllipsisVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            {actions.map(action => (
              <DropdownMenuItem
                key={action.label}
                onClick={() => {
                  if (action.confirm) setPendingConfirm(action);
                  else action.onClick();
                }}
                variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                className="gap-2.5 px-3 py-2.5 text-sm"
              >
                <action.icon className="size-4" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {pendingConfirm?.confirm && (
        <ConfirmDialog
          trigger={<span className="hidden" />}
          open={!!pendingConfirm}
          onOpenChange={open => {
            if (!open) setPendingConfirm(null);
          }}
          title={pendingConfirm.confirm.title}
          description={pendingConfirm.confirm.description}
          confirmLabel={pendingConfirm.label}
          confirmClassName={
            pendingConfirm.variant === 'destructive' ? 'bg-destructive text-white hover:bg-destructive/90' : undefined
          }
          onConfirm={() => {
            pendingConfirm.onClick();
            setPendingConfirm(null);
          }}
        />
      )}
    </div>
  );
}
