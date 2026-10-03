import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Props = {
  /** Width class of the cell. The column header uses the same class, so the columns line up. */
  widthClass: string;
  /** Keep the buttons visible on desktop, for example while a dialog of a button is open. */
  forceVisible?: boolean;
  children: ReactNode;
};

/**
 * The actions cell at the end of a tree row.
 * Desktop: hidden until the row is hovered or focused, or a dialog is open.
 * Mobile (no hover): always visible.
 */
export function TreeActionsCell({ widthClass, forceVisible = false, children }: Props) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-end gap-0.5',
        widthClass,
        'lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100',
        forceVisible && 'lg:opacity-100'
      )}
    >
      {children}
    </div>
  );
}
