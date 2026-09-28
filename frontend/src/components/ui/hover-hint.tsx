'use client';

// Small hover label for icon buttons (name + optional keyboard shortcut).
// Different from `Tooltip` in tooltip.tsx: that one is a click-to-pin help popover.
// This one only shows on hover/focus and never takes the click.
// Needs the shared `Tooltip.Provider` in `Providers.tsx`.

import { Tooltip } from 'radix-ui';

import { cn } from '@/lib/utils';

type HoverHintProps = {
  label: string;
  /** Optional shortcut, e.g. "⌘B". Shown dimmed after the label. */
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
};

export function HoverHint({ label, shortcut, side = 'top', children }: HoverHintProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          data-slot="hover-hint"
          className={cn(
            // z-[70]: above the editor bubble menu and its popovers.
            'z-[70] flex items-center gap-1.5 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background',
            'animate-in fade-in-0 zoom-in-95'
          )}
        >
          <span>{label}</span>
          {shortcut && <span className="opacity-60">{shortcut}</span>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
