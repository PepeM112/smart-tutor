'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/shared/DataTable';
import { type MobileAction, DataTableV2 } from '@/components/shared/DataTableV2';
import { expandToggleColumn } from '@/components/shared/expandToggleColumn';
import { Pagination } from '@/components/shared/Pagination';
import { type SortDirection, type SortState } from '@/components/shared/SortableHeader';

import { DEMO_ITEMS, DEMO_PER_PAGE, DEMO_TOTAL_ROWS, type DemoItem } from '../demoData';

import { SandboxDemo, SandboxSection } from './SandboxSection';

const COLUMNS: ColumnDef<DemoItem, unknown>[] = [
  { accessorKey: 'title', header: 'Title', meta: { sortKey: 'title', label: 'Title', grow: true } },
  { accessorKey: 'kind', header: 'Kind', meta: { sortKey: 'kind', label: 'Kind', widthClass: 'w-24' } },
  { accessorKey: 'owner', header: 'Owner', meta: { label: 'Owner', widthClass: 'w-32', hideOnMobile: true } },
  { accessorKey: 'updated', header: 'Updated', meta: { label: 'Updated', widthClass: 'w-32' } },
];

const V2_COLUMNS: ColumnDef<DemoItem, unknown>[] = [expandToggleColumn<DemoItem>(row => row.title), ...COLUMNS];

const NO_ACTION = (): void => undefined;

const renderActions = (item: DemoItem): MobileAction[][] => [
  [
    { label: 'Edit', icon: Pencil, onClick: NO_ACTION },
    { label: 'Duplicate', icon: Copy, onClick: NO_ACTION },
  ],
  [
    {
      label: 'Delete',
      icon: Trash2,
      variant: 'destructive',
      onClick: NO_ACTION,
      confirm: { title: 'Delete this item?', description: `${item.title} moves to the Trash.` },
    },
  ],
];

const renderPreview = (item: DemoItem) => (
  <div className="min-w-0">
    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.kind}</p>
  </div>
);

const sortItems = (items: DemoItem[], { column, order }: SortState): DemoItem[] => {
  if (!column || !order) return items;
  const key = column as keyof DemoItem;
  const direction = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * direction);
};

export function TablesSection() {
  const [sort, setSort] = useState<SortState>({ column: null, order: null });
  const [page, setPage] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const rows = useMemo(() => sortItems(DEMO_ITEMS, sort), [sort]);
  const handleSort = (column: string | null, order: SortDirection): void => setSort({ column, order });

  return (
    <SandboxSection id="tables" title="Data tables">
      <SandboxDemo label="DataTableV2: sort, preview, actions and inline detail">
        <DataTableV2
          columns={V2_COLUMNS}
          data={rows}
          sort={sort}
          onSort={handleSort}
          getRowId={item => item.id}
          previewId={previewId}
          onPreview={item => setPreviewId(item.id)}
          renderActions={renderActions}
          renderPreview={renderPreview}
          renderExpanded={item => <p className="max-w-prose text-sm text-muted-foreground">{item.description}</p>}
        />
      </SandboxDemo>

      <SandboxDemo label="DataTableV2: empty">
        <DataTableV2 columns={COLUMNS} data={[]} emptyMessage="Nothing here yet." />
      </SandboxDemo>

      <SandboxDemo label="DataTable">
        <DataTable
          columns={COLUMNS}
          data={rows}
          sort={sort}
          onSort={handleSort}
          renderPreview={renderPreview}
          renderActions={item => renderActions(item).flat()}
        />
      </SandboxDemo>

      <SandboxDemo label="Pagination">
        <Pagination page={page} perPage={DEMO_PER_PAGE} total={DEMO_TOTAL_ROWS} onPageChange={setPage} />
      </SandboxDemo>
    </SandboxSection>
  );
}
