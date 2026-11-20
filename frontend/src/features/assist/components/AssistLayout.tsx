'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator, useGroupRef, usePanelRef } from 'react-resizable-panels';

import { useAiAvailable } from '@/hooks/useAiAvailable';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { PANEL_ANIMATING_CLASS, readPanelDurationMs, usePanelAnimation } from '@/lib/panelMotion';
import { cn } from '@/lib/utils';

import { useOutlineAutoCollapse } from '../hooks/useOutlineAutoCollapse';
import { useIsAssistHidden } from '../store/useAssistHiddenStore';
import {
  assistPageKey,
  DEFAULT_ASSIST_WIDTH,
  MIN_ASSIST_WIDTH,
  selectAssistWidth,
  useAssistPanelStore,
} from '../store/useAssistPanelStore';

import { AssistFullScreen } from './AssistFullScreen';
import { AssistSheet } from './AssistSheet';

interface AssistLayoutProps {
  /** The main sheet. */
  children: ReactNode;
}

const MAIN_ID = 'main';
const ASSIST_ID = 'assist';
const MAX_ASSIST_SIZE = '50%';
const toPx = (width: number): string => `${width}px`;

/**
 * The area right of the nav: the main sheet and, when open, the Ask AI sheet. At `lg` and wider the Ask AI
 * sheet is a resizable panel next to the main sheet. Below `lg` it is a full-screen dialog.
 */
export function AssistLayout({ children }: AssistLayoutProps) {
  const aiAvailable = useAiAvailable();
  const isHidden = useIsAssistHidden();
  const { isDesktop } = useBreakpoint();
  const isOpen = useAssistPanelStore(s => s.isOpen);
  const isSheetWanted = aiAvailable && !isHidden && isOpen;

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 lg:p-3 lg:pl-0">
        <SheetGroup isSheetWanted={isSheetWanted && isDesktop}>{children}</SheetGroup>
      </div>
      {isSheetWanted && !isDesktop && <AssistFullScreen />}
    </>
  );
}

interface SheetGroupProps {
  isSheetWanted: boolean;
  children: ReactNode;
}

/**
 * Open: the panel mounts at 0px, then grows to the saved width (`panelMotion`). Close: it folds to 0px, then
 * unmounts. The panel has no minimum while it moves, so it can reach 0. A drag is never animated.
 */
function SheetGroup({ isSheetWanted, children }: SheetGroupProps) {
  const t = useTranslations('assist.panel');
  const pathname = usePathname();
  const pageKey = assistPageKey(pathname);
  const groupElementRef = useRef<HTMLDivElement>(null);
  const groupRef = useGroupRef();
  const panelRef = usePanelRef();
  const { animate } = usePanelAnimation();
  useOutlineAutoCollapse(isSheetWanted, groupElementRef, pageKey);
  const setWidth = useAssistPanelStore(s => s.setWidth);
  const resetWidth = useAssistPanelStore(s => s.resetWidth);

  const [isMounted, setIsMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  // True once the open motion ended: from then on the panel has its minimum width.
  const [isSettled, setIsSettled] = useState(false);

  const pageKeyRef = useRef(pageKey);
  useEffect(() => {
    pageKeyRef.current = pageKey;
  });

  // Mounts the panel in the same render that asks for it, so the open effect below starts with it in place.
  if (isSheetWanted && !isMounted) setIsMounted(true);

  useEffect(() => {
    if (!isSheetWanted || !isMounted) return;
    let settleTimer: number | undefined;
    // The panel registers after its effects: the first size change waits one frame.
    const frame = window.requestAnimationFrame(() => {
      animate(groupElementRef.current);
      panelRef.current?.resize(toPx(selectAssistWidth(pageKeyRef.current)(useAssistPanelStore.getState())));
      setIsExpanded(true);
      settleTimer = window.setTimeout(() => setIsSettled(true), readPanelDurationMs());
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [isSheetWanted, isMounted, animate, panelRef]);

  useEffect(() => {
    if (isSheetWanted || !isMounted) return;
    let unmountTimer: number | undefined;
    // The panel loses its minimum in the render where `isSheetWanted` is false (`minSize` below). The library
    // applies a new minimum after the effects, so the fold waits one frame.
    const frame = window.requestAnimationFrame(() => {
      setIsSettled(false);
      animate(groupElementRef.current);
      panelRef.current?.resize(0);
      setIsExpanded(false);
      unmountTimer = window.setTimeout(() => setIsMounted(false), readPanelDurationMs());
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(unmountTimer);
    };
  }, [isSheetWanted, isMounted, animate, panelRef]);

  // Each page keeps its own width: going to another page while the sheet is open resizes it to that page's width.
  const widthOfPage = useAssistPanelStore(selectAssistWidth(pageKey));
  const isFirstPage = useRef(true);
  useEffect(() => {
    if (isFirstPage.current) {
      isFirstPage.current = false;
      return;
    }
    if (isExpanded) panelRef.current?.resize(toPx(widthOfPage));
    // Only a page change resizes: a width saved by a drag must not feed back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  // Only user resizes are saved: opening, closing and a window resize also change the layout.
  const handleLayoutChanged = (_layout: unknown, meta: { isUserInteraction: boolean }): void => {
    const size = panelRef.current?.getSize();
    if (!meta.isUserInteraction || !size || size.inPixels === 0) return;
    setWidth(pageKeyRef.current, size.inPixels);
  };

  // The library's own double-click resets to the size at mount, so it is off.
  const handleResetWidth = (): void => {
    resetWidth(pageKeyRef.current);
    panelRef.current?.resize(toPx(DEFAULT_ASSIST_WIDTH));
  };

  const canResize = isSheetWanted && isSettled;

  return (
    <Group
      elementRef={groupElementRef}
      groupRef={groupRef}
      orientation="horizontal"
      onLayoutChanged={handleLayoutChanged}
      className={cn('min-h-0 min-w-0 flex-1', PANEL_ANIMATING_CLASS)}
      // Auto size and visible overflow: the group is a flex item, and the shadow of the sheets is not clipped.
      style={{ width: 'auto', height: 'auto', overflow: 'visible' }}
    >
      <Panel id={MAIN_ID} minSize="30%" style={{ overflow: 'visible' }}>
        {children}
      </Panel>

      {isMounted && (
        <>
          {/* The handle sits in the 12px gap between the sheets. It folds to 0 width together with the panel. */}
          <Separator
            aria-label={t('resize')}
            disabled={!canResize}
            disableDoubleClick
            onDoubleClick={handleResetWidth}
            className={cn(
              'group relative flex shrink-0 cursor-col-resize items-center justify-center overflow-hidden outline-none',
              isExpanded ? 'w-3' : 'w-0'
            )}
          >
            <div className="h-10 w-1 rounded-sm bg-rule transition-colors group-hover:bg-muted-foreground group-focus-visible:bg-ring" />
          </Separator>
          <Panel
            id={ASSIST_ID}
            panelRef={panelRef}
            defaultSize={0}
            minSize={canResize ? toPx(MIN_ASSIST_WIDTH) : 0}
            maxSize={MAX_ASSIST_SIZE}
            groupResizeBehavior="preserve-pixel-size"
            // Clipped while it moves: the content keeps its width and is revealed, not squeezed.
            style={{ overflow: isSettled ? 'visible' : 'hidden' }}
          >
            <aside
              aria-label={t('title')}
              className="flex h-full min-w-75 flex-col rounded-lg border border-border bg-card shadow-card"
            >
              <AssistSheet />
            </aside>
          </Panel>
        </>
      )}
    </Group>
  );
}
