'use client';

import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function Sheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'left',
  title = 'Panel',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right';
  title?: string;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col bg-sidebar text-sidebar-foreground shadow-lg outline-none',
          'inset-y-0 h-full w-72',
          'data-open:animate-in data-closed:animate-out data-open:duration-300 data-closed:duration-200',
          side === 'left' && 'left-0 data-open:slide-in-from-left data-closed:slide-out-to-left',
          side === 'right' && 'right-0 data-open:slide-in-from-right data-closed:slide-out-to-right',
          className
        )}
        {...props}
      >
        <DialogPrimitive.Title asChild>
          <VisuallyHidden.Root>{title}</VisuallyHidden.Root>
        </DialogPrimitive.Title>
        <DialogPrimitive.Description asChild>
          <VisuallyHidden.Root>{title}</VisuallyHidden.Root>
        </DialogPrimitive.Description>
        {children}
        <DialogPrimitive.Close data-slot="sheet-close" asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetPortal, SheetOverlay, SheetTrigger };
