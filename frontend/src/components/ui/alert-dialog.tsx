import { AlertDialog } from 'radix-ui';
import * as React from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function AlertDialogRoot(props: React.ComponentProps<typeof AlertDialog.Root>) {
  return <AlertDialog.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(props: React.ComponentProps<typeof AlertDialog.Trigger>) {
  return <AlertDialog.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal(props: React.ComponentProps<typeof AlertDialog.Portal>) {
  return <AlertDialog.Portal data-slot="alert-dialog-portal" {...props} />;
}

const AlertDialogOverlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof AlertDialog.Overlay>>(
  ({ className, ...props }, ref) => (
    <AlertDialog.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
      ref={ref}
    />
  )
);
AlertDialogOverlay.displayName = 'AlertDialogOverlay';

const AlertDialogContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof AlertDialog.Content>>(
  ({ className, children, ...props }, ref) => (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialog.Content
        ref={ref}
        data-slot="alert-dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-[calc(100%-2rem)] sm:max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-6 ring-1 ring-foreground/10',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      >
        {children}
      </AlertDialog.Content>
    </AlertDialogPortal>
  )
);
AlertDialogContent.displayName = 'AlertDialogContent';

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="alert-dialog-header" className={cn('flex flex-col gap-1 mb-5', className)} {...props} />
);
AlertDialogHeader.displayName = 'AlertDialogHeader';

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="alert-dialog-footer" className={cn('flex justify-end gap-2', className)} {...props} />
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof AlertDialog.Title>>(
  ({ className, ...props }, ref) => (
    <AlertDialog.Title
      ref={ref}
      data-slot="alert-dialog-title"
      className={cn('text-base font-semibold text-foreground', className)}
      {...props}
    />
  )
);
AlertDialogTitle.displayName = 'AlertDialogTitle';

const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof AlertDialog.Description>
>(({ className, ...props }, ref) => (
  <AlertDialog.Description
    ref={ref}
    data-slot="alert-dialog-description"
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof AlertDialog.Action>
>(({ className, ...props }, ref) => (
  <AlertDialog.Action
    ref={ref}
    data-slot="alert-dialog-action"
    className={cn(buttonVariants(), className)}
    {...props}
  />
));
AlertDialogAction.displayName = 'AlertDialogAction';

const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof AlertDialog.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialog.Cancel
    ref={ref}
    data-slot="alert-dialog-cancel"
    className={cn(buttonVariants({ variant: 'outline' }), className)}
    {...props}
  />
));
AlertDialogCancel.displayName = 'AlertDialogCancel';

export {
  AlertDialogRoot as AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
