import { cn } from '@/lib/utils';

/**
 * One box for every row at the foot of the sidebar (Settings, Logout) and the nav links. The left padding is
 * fixed: it centers the 16px icon in the 44px rail, so the icon does not move when the sidebar opens and the
 * label (always mounted, clipped by `overflow-hidden`) fades in beside it.
 */
export const sidebarItemClass = (isActive = false): string =>
  cn(
    'flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-lg px-3.5 text-[15px] transition-colors',
    'text-sidebar-foreground hover:bg-sidebar-accent',
    isActive && 'bg-sidebar-accent font-medium'
  );
