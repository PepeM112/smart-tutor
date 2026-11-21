import { PANEL_FADE_CLASS } from '@/lib/panelMotion';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

type SidebarLabelProps = {
  collapsed: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * The label stays mounted and fades with the width, so no text pops in or out. It is hidden from assistive
 * technology while railed: the row carries its own `aria-label` then.
 */
export function SidebarLabel({ collapsed, children, className }: SidebarLabelProps) {
  return (
    <span
      aria-hidden={collapsed || undefined}
      className={cn('truncate', PANEL_FADE_CLASS, collapsed ? 'opacity-0' : 'opacity-100', className)}
    >
      {children}
    </span>
  );
}
