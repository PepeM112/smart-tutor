'use client';

import type { ReactNode } from 'react';

type ListPageHeaderProps = {
  /** The `FilterPopover` (or equivalent) control. Always rendered in a non-stretching wrapper. */
  filters: ReactNode;
  /** Create-button(s) or a subtitle. Omit to render filters alone, still correctly non-stretched. */
  actions?: ReactNode;
};

/**
 * Shared header row for list pages (Tests, Questions, Notes, History): a Filters control on the
 * left and optional actions (create button(s), or a subtitle for History) on the right.
 *
 * Stays a single row at every viewport width — no `flex-col` -> `lg:flex-row` breakpoint switch,
 * which previously stacked the actions below Filters on mobile. Both slots get their own
 * non-stretching wrapper so a bare child (e.g. History's `FilterPopover`, which has no width
 * class of its own) never inherits the flex container's default cross-axis `stretch` and renders
 * full-width.
 */
export function ListPageHeader({ filters, actions }: ListPageHeaderProps) {
  return (
    <div className="flex flex-row flex-wrap items-center justify-between gap-3">
      <div className="flex shrink-0 items-center gap-2">{filters}</div>
      {actions && <div className="flex min-w-0 shrink items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}
