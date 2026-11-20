'use client';

import { type ReactNode, useState } from 'react';

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
 *
 * `main` keeps one place in the tree: below `lg` the same `SplitPane` renders with no side pane (the drawer
 * shows `side` instead), so the local state of `main` survives a resize across `lg`.
 */
export function ResponsiveSplitPane({
  onSideClose,
  drawerTitle,
  mobileMainClassName,
  insetDrawerBody = true,
  ...splitPaneProps
}: ResponsiveSplitPaneProps) {
  const { isDesktop } = useBreakpoint();
  const { side, mainClassName } = splitPaneProps;
  // The parent sets `side` to null when the drawer closes. The drawer needs the content during the exit animation.
  const drawerSide = useLastSide(side);

  return (
    <>
      <SplitPane
        {...splitPaneProps}
        side={isDesktop ? side : null}
        // No side pane on mobile (it is a drawer), so the right space is always padding.
        mainClassName={cn(mainClassName, !isDesktop && mobileMainClassName)}
      />
      {!isDesktop && (
        <Drawer open={!!side} onOpenChange={open => !open && onSideClose()}>
          <DrawerContent className={DRAWER_HEIGHT_CLASS} title={drawerTitle}>
            {insetDrawerBody ? <DrawerBody>{drawerSide}</DrawerBody> : drawerSide}
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}

function DrawerBody({ children }: { children: ReactNode }) {
  return <div className="overflow-y-auto px-4 pb-8">{children}</div>;
}

/** The last truthy `side`, like the pane check (`side &&`). It keeps the drawer content while the close animation runs. */
function useLastSide(side: ReactNode): ReactNode {
  const [last, setLast] = useState<ReactNode>(side);
  // Set state during render: React re-renders at once, so there is no frame with stale content.
  if (side && side !== last) setLast(side);
  return side || last;
}
