import { HelpCircle } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useCallback, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type TooltipProps = {
  content: React.ReactNode;
  children?: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
};

const HOVER_DELAY = 150;

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleMouseEnter = useCallback(() => {
    if (pinned.current) return;
    hoverTimeout.current = setTimeout(() => setOpen(true), HOVER_DELAY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimeout.current);
    if (!pinned.current) setOpen(false);
  }, []);

  const handleClick = useCallback(() => {
    clearTimeout(hoverTimeout.current);
    if (pinned.current) {
      pinned.current = false;
      setOpen(false);
    } else {
      pinned.current = true;
      setOpen(true);
    }
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      pinned.current = false;
      setOpen(false);
    }
  }, []);

  return (
    <Popover.Root data-slot="tooltip" open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <span
          role="button"
          tabIndex={0}
          data-slot="tooltip-trigger"
          className="inline-flex cursor-pointer"
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {children ?? <HelpCircle className="size-3.5 text-muted-foreground/60" />}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          sideOffset={6}
          data-slot="tooltip-content"
          onMouseEnter={() => clearTimeout(hoverTimeout.current)}
          onMouseLeave={handleMouseLeave}
          className={cn(
            'z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background',
            'animate-in fade-in-0 zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className
          )}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
