import { type ReactNode } from 'react';

type Props = {
  /** Left side of the top bar: usually a `FileBreadcrumb` (it includes the back arrow). */
  breadcrumb: ReactNode;
  /** Right side of the top bar: actions for this item. */
  actions?: ReactNode;
  /** Search field. On a wide screen it sits between the breadcrumb and the actions; on a narrow screen it gets its own row. */
  search?: ReactNode;
  children: ReactNode;
};

/**
 * Standard frame for a page of an item in the file tree (note or folder).
 * One place for the top bar padding and height, so every file page looks the same.
 * It fills the content area of the app layout; `children` get the remaining height.
 * `children` that scroll should bleed to the page edge (`pageBleed`), so the scrollbar is not inset.
 */
export function FilePageShell({ breadcrumb, actions, search, children }: Props) {
  return (
    <div className="flex h-full flex-col">
      {/* Same top padding as PageHeader (p-4 lg:p-8); the layout gives the side padding. */}
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 mt-4 mb-2 lg:mt-8 lg:mb-4 lg:flex-nowrap">
        <div className={search ? 'min-w-0 flex-1 lg:flex-none' : 'min-w-0 flex-1'}>{breadcrumb}</div>
        {search && <div className="order-last w-full lg:order-none lg:min-w-48 lg:max-w-150 lg:flex-1">{search}</div>}
        {actions && <div className="flex shrink-0 items-center gap-1 lg:ml-auto">{actions}</div>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
