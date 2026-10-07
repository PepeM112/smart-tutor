import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    sortKey?: string;
    label?: string;
    hideOnMobile?: boolean;
    /** DataTableV2: width and alignment classes of the column (header and cells), e.g. `w-24 text-right`. */
    widthClass?: string;
    /** DataTableV2: the column takes the free space (`flex-1`). Use it on one column. */
    grow?: boolean;
  }
}
