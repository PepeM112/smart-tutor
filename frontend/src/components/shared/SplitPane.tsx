'use client';

import { type ReactNode } from 'react';

import { useResizableSplit } from '@/hooks/useResizableSplit';
import { cn } from '@/lib/utils';

type Props = {
  /** localStorage key for the saved ratio. Each split in the app uses its own key. */
  storageKey: string;
  defaultRatio?: number;
  /** Left pane. It scrolls by itself. */
  main: ReactNode;
  /** Right pane. `null` hides it and the divider, and the main pane uses the full width. */
  side: ReactNode | null;
  className?: string;
};

/**
 * Two panes side by side with a draggable divider (double-click resets the ratio).
 * The base of the tiling layout: the note AI diff panel and the Files preview use it.
 * The parent must give it a definite height.
 */
export function SplitPane({ storageKey, defaultRatio = 0.5, main, side, className }: Props) {
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio } = useResizableSplit(storageKey, defaultRatio);

  return (
    <div ref={containerRef} data-slot="split-pane" className={cn('flex min-h-0 flex-1 overflow-hidden', className)}>
      <div className="min-w-0 overflow-y-auto" style={{ flex: side ? splitRatio : 1 }}>
        {main}
      </div>

      {side && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            className="relative mx-2 flex w-5 shrink-0 cursor-col-resize items-center justify-center"
            onMouseDown={handleDividerMouseDown}
            onDoubleClick={resetRatio}
          >
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
            <div className="relative z-10 h-7 w-3 rounded-full border border-border bg-background" />
          </div>
          <div
            className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
            style={{ flex: 1 - splitRatio }}
          >
            {side}
          </div>
        </>
      )}
    </div>
  );
}
