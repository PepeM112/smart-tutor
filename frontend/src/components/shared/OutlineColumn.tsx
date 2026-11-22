'use client';

import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator, useGroupRef, usePanelRef } from 'react-resizable-panels';
import { Drawer as DrawerPrimitive } from 'vaul';

import { Drawer, DrawerPortal, DrawerTitle } from '@/components/ui/drawer';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { PANEL_ANIMATING_CLASS, usePanelAnimation, useStagedReveal } from '@/lib/panelMotion';
import { cn } from '@/lib/utils';
import { DEFAULT_OUTLINE_WIDTH, MIN_OUTLINE_WIDTH, selectOutlineWidth, useOutlineStore } from '@/store/useOutlineStore';

type OutlineColumnProps = {
  /** Names the saved width. Each page kind with an outline uses its own key. */
  storageKey: string;
  /** Accessible name of the outline navigation, and the title of the phone drawer. */
  label: string;
  /** The content of the column. It also fills the Contents drawer below `lg`. */
  outline: ReactNode;
  /** The page. It stays mounted when the column folds or the window crosses `lg`. */
  children: ReactNode;
};

// Unique ids: the library copies them to `data-testid`, and the Ask AI layout already uses `main`.
const OUTLINE_ID = 'outline-nav';
const PAGE_ID = 'outline-page';
const MAX_OUTLINE_SIZE = '40%';
const toPx = (width: number): string => `${width}px`;

/**
 * A page with an outline: a column on the left of the page (from `lg`) and a left drawer below it.
 * The column is a resizable panel, with the same motion as the Ask AI sheet (`panelMotion`). The outline is a
 * floating card inside the sheet, with a gap to the sheet edges and to the page. The column cancels the layout
 * padding (`app/(app)/layout.tsx`) so the panel can clip the card while it folds, and gives the padding back to the page. Open state, auto-collapse for Ask AI and the Contents drawer live in `useOutlineStore`.
 * Its height is a percentage of the layout wrapper (a flex item, so definite) plus the padding it cancels (3.5rem).
 */
export function OutlineColumn({ storageKey, label, outline, children }: OutlineColumnProps) {
  const t = useTranslations('outline');
  const { isDesktop } = useBreakpoint();
  const isOpen = useOutlineStore(s => s.isOpen);
  const setWidth = useOutlineStore(s => s.setWidth);
  const setOpen = useOutlineStore(s => s.setOpen);
  const register = useOutlineStore(s => s.register);
  const unregister = useOutlineStore(s => s.unregister);

  const groupRef = useGroupRef();
  const panelRef = usePanelRef();
  const groupElementRef = useRef<HTMLDivElement>(null);
  const { animate } = usePanelAnimation();

  useEffect(() => {
    register(storageKey);
    return unregister;
  }, [storageKey, register, unregister]);

  const isShown = isDesktop && isOpen;
  // The library reads `defaultSize` once, when the panel registers. Later changes go through the panel handle.
  const [initial] = useState(() => ({
    isShown,
    width: selectOutlineWidth({ widths: useOutlineStore.getState().widths, activeKey: storageKey }),
  }));

  // Same staged fade as the Files preview (`SplitPane`): the card fades out, then the width folds. Opening grows
  // the width at once and the card fades in near the end.
  const { isWidthOpen, isMounted, isFolding, completeFold, contentClassName } = useStagedReveal(isShown);

  const wasShown = useRef(isShown);
  useEffect(() => {
    if (wasShown.current === isShown) return;
    wasShown.current = isShown;
    if (!isShown) return;
    animate(groupElementRef.current);
    panelRef.current?.resize(toPx(selectOutlineWidth(useOutlineStore.getState())));
  }, [isShown, animate, panelRef]);

  // The fold waits one frame: the phase must render before the panel collapses (see `SplitPane`).
  useEffect(() => {
    if (!isFolding) return;
    const foldFrame = window.requestAnimationFrame(() => {
      animate(groupElementRef.current);
      panelRef.current?.collapse();
      completeFold();
    });
    return () => window.cancelAnimationFrame(foldFrame);
  }, [isFolding, animate, panelRef, completeFold]);

  // Only user resizes count: a fold for Ask AI or a window resize also changes the layout. A drag down to the
  // minimum closes the column, and the toggle in the header then shows it as closed.
  const handleLayoutChanged = (_layout: unknown, meta: { isUserInteraction: boolean }): void => {
    const size = panelRef.current?.getSize();
    if (!meta.isUserInteraction || !size) return;
    if (size.inPixels === 0) setOpen(false);
    else setWidth(storageKey, size.inPixels);
  };

  // The library's own double-click resets to the size at mount, so it is off.
  const handleResetWidth = (): void => {
    setWidth(storageKey, DEFAULT_OUTLINE_WIDTH);
    panelRef.current?.resize(toPx(DEFAULT_OUTLINE_WIDTH));
  };

  return (
    <div
      data-slot="outline-column"
      className="flex h-full min-h-0 overflow-hidden lg:-mt-6 lg:-mr-8 lg:-mb-8 lg:-ml-8 lg:h-[calc(100%+3.5rem)]"
    >
      <Group
        elementRef={groupElementRef}
        groupRef={groupRef}
        orientation="horizontal"
        onLayoutChanged={handleLayoutChanged}
        className={cn('min-h-0 min-w-0 flex-1', PANEL_ANIMATING_CLASS)}
        style={{ width: 'auto', height: 'auto', overflow: 'visible' }}
      >
        <Panel
          id={OUTLINE_ID}
          panelRef={panelRef}
          defaultSize={initial.isShown ? toPx(initial.width) : 0}
          minSize={toPx(MIN_OUTLINE_WIDTH)}
          maxSize={MAX_OUTLINE_SIZE}
          collapsible
          collapsedSize={0}
          groupResizeBehavior="preserve-pixel-size"
          // Clipped: the content keeps its width while the column moves, and is revealed, not squeezed.
          style={{ overflow: 'hidden' }}
        >
          {isDesktop && isMounted && (
            // The wrapper holds the gap, so the card keeps its shadow inside the clipped panel. The fade is on it, so
            // the card, its border and its shadow fade together.
            <div className={cn('min-w-50 py-3 pl-3', contentClassName)}>
              <nav
                aria-label={label}
                inert={!isShown}
                className="h-full overflow-y-auto rounded-lg border border-border bg-outline px-2.5 py-4 shadow-card"
              >
                {outline}
              </nav>
            </div>
          )}
        </Panel>

        {/* The line shows on hover and focus only: the card edge already marks the column. */}
        <Separator
          aria-label={t('resize')}
          aria-hidden={!isShown}
          inert={!isShown}
          disabled={!isShown}
          disableDoubleClick
          onDoubleClick={handleResetWidth}
          className={cn(
            'group relative flex shrink-0 cursor-col-resize items-center justify-center overflow-hidden outline-none',
            isWidthOpen ? 'w-1.5' : 'w-0'
          )}
        >
          <div className="h-full w-px bg-transparent transition-colors group-hover:bg-rule group-focus-visible:bg-ring" />
        </Separator>

        <Panel id={PAGE_ID} className="relative min-w-0 overflow-hidden">
          {/* Padding from `lg` only: below it the layout padding of `main` already gives the gutter. */}
          {/* Absolute: a percentage height does not resolve inside the panel, so the scroller would grow to its content. */}
          <div className="absolute inset-0 flex min-h-0 flex-col overflow-y-auto lg:px-8 lg:pt-6 lg:pb-8">
            {children}
          </div>
        </Panel>
      </Group>

      {!isDesktop && <ContentsDrawer label={label}>{outline}</ContentsDrawer>}
    </div>
  );
}

type ContentsDrawerProps = { label: string; children: ReactNode };

/** Below `lg` the outline is a left drawer. It closes when the reader picks an entry. */
function ContentsDrawer({ label, children }: ContentsDrawerProps) {
  const isDrawerOpen = useOutlineStore(s => s.isDrawerOpen);
  const setDrawerOpen = useOutlineStore(s => s.setDrawerOpen);

  const closeOnPick = (event: MouseEvent<HTMLElement>): void => {
    if (event.target instanceof Element && event.target.closest('a, [data-outline-pick]')) setDrawerOpen(false);
  };

  return (
    <Drawer open={isDrawerOpen} onOpenChange={setDrawerOpen} direction="left">
      <DrawerPortal>
        <DrawerPrimitive.Overlay data-slot="drawer-overlay" className="fixed inset-0 z-50 bg-black/50" />
        <DrawerPrimitive.Content
          data-slot="drawer-content"
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col bg-outline text-foreground outline-none"
        >
          <DrawerTitle className="px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2 font-serif text-lg font-medium">
            {label}
          </DrawerTitle>
          <nav aria-label={label} onClick={closeOnPick} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
            {children}
          </nav>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}
