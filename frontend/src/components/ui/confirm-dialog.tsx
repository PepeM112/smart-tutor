import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type ConfirmDialogProps = {
  /** Element that opens the dialog */
  trigger: React.ReactNode;
  title: string;
  description?: string;
  /** Optional content rendered between description and footer (e.g. an input) */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Extra classes forwarded to the confirm button */
  confirmClassName?: string;
  /** Disables the confirm button */
  disableConfirm?: boolean;
  onConfirm: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmClassName,
  disableConfirm = false,
  onConfirm,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const isControlled = open !== undefined;

  return (
    <AlertDialog {...(isControlled ? { open, onOpenChange } : { onOpenChange })}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children && <div className="mt-4">{children}</div>}
        <AlertDialogFooter className="mt-6">
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={disableConfirm} className={cn(confirmClassName)}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
