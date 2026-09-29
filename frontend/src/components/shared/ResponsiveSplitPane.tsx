'use client';

import { type ReactNode } from 'react';

import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';

import { SplitPane, type SplitPaneProps } from './SplitPane';

type ResponsiveSplitPaneProps = SplitPaneProps & {
  /** Called when the user closes the mobile drawer. Clear the state that made `side` non-null. */
  onSideClose: () => void;
  /** Accessible name of the mobile drawer (screen readers only). */
  drawerTitle?: string;
  /** Extra classes for the main pane on mobile (the desktop pane uses `mainClassName`). */
  mobileMainClassName?: string;
  /**
   * `true` (default): the drawer body scrolls and has padding (`px-4 pb-8`).
   * `false`: `side` is rendered as it is. Use it when `side` has its own frame and scroll.
   */
  insetDrawerBody?: boolean;
};

/** One height for every side drawer, so all of them feel the same. */
const DRAWER_HEIGHT_CLASS = 'max-h-[75dvh]';

/**
 * A `SplitPane` on desktop (from `lg`) and a bottom `Drawer` below it.
 * `side` is the right pane on desktop and the drawer content on mobile;
 * `null` hides both. The parent must give a definite height, as for `SplitPane`.
 */
export function ResponsiveSplitPane({
  onSideClose,
  drawerTitle,
  mobileMainClassName,
  insetDrawerBody = true,
  ...splitPaneProps
}: ResponsiveSplitPaneProps) {
  const { isDesktop } = useBreakpoint();
  const { main, side } = splitPaneProps;

  if (isDesktop) return <SplitPane {...splitPaneProps} />;

  return (
    <>
      <div className={cn('min-h-0 flex-1 overflow-y-auto', mobileMainClassName)}>{main}</div>
      <Drawer open={!!side} onOpenChange={open => !open && onSideClose()}>
        <DrawerContent className={DRAWER_HEIGHT_CLASS} title={drawerTitle}>
          {insetDrawerBody ? <DrawerBody>{side}</DrawerBody> : side}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function DrawerBody({ children }: { children: ReactNode }) {
  return <div className="overflow-y-auto px-4 pb-8">{children}</div>;
}
