'use client';

import { Popover } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

function FloatingCard({ modal = false, ...props }: React.ComponentProps<typeof Popover.Root>) {
  return <Popover.Root data-slot="floating-card" modal={modal} {...props} />;
}

function FloatingCardTrigger({ asChild = true, ...props }: React.ComponentProps<typeof Popover.Trigger>) {
  return <Popover.Trigger data-slot="floating-card-trigger" asChild={asChild} {...props} />;
}

function FloatingCardAnchor({ asChild = true, ...props }: React.ComponentProps<typeof Popover.Anchor>) {
  return <Popover.Anchor data-slot="floating-card-anchor" asChild={asChild} {...props} />;
}

function FloatingCardContent({
  className,
  side = 'bottom',
  sideOffset = 8,
  align = 'start',
  resizable = false,
  ...props
}: React.ComponentProps<typeof Popover.Content> & { resizable?: boolean }) {
  return (
    <Popover.Portal>
      <Popover.Content
        data-slot="floating-card-content"
        side={side}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 rounded-lg bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10',
          'animate-in fade-in-0 zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          resizable && 'resize overflow-auto',
          className
        )}
        {...props}
      />
    </Popover.Portal>
  );
}

export { FloatingCard, FloatingCardTrigger, FloatingCardAnchor, FloatingCardContent };
