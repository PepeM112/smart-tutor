import { type ColumnDef } from '@tanstack/react-table';

import { ExpandToggle } from '@/components/shared/ExpandToggle';

/** The column with the button that opens a row's `renderExpanded` content. `getTitle` names the row for screen readers. */
export function expandToggleColumn<T>(getTitle: (row: T) => string): ColumnDef<T, unknown> {
  return {
    id: 'expand',
    meta: { widthClass: 'w-8' },
    cell: ({ row }) => (
      <ExpandToggle
        title={getTitle(row.original)}
        isExpanded={row.getIsExpanded()}
        onToggle={row.getToggleExpandedHandler()}
      />
    ),
  };
}
