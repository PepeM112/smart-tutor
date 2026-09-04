'use client';

import { EllipsisVertical } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';

export type MobileAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'destructive';
  /** Custom className merged onto the rendered menu item, e.g. for a semantic color that isn't `destructive`. */
  className?: string;
  node?: ReactNode;
  confirm?: {
    title: string;
    description: string;
  };
};

export function ActionsMenu({ actions }: { actions: MobileAction[] }) {
  const [pendingConfirm, setPendingConfirm] = useState<MobileAction | null>(null);

  return (
    <div data-slot="actions-menu" className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" className="text-muted-foreground">
              <EllipsisVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            {actions.map(action => (
              <DropdownMenuItem
                key={action.label}
                onClick={() => {
                  if (action.confirm) setPendingConfirm(action);
                  else action.onClick();
                }}
                variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                className={cn('gap-2.5 px-3 py-2.5 text-sm', action.className)}
              >
                <action.icon className="size-4" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {pendingConfirm?.confirm && (
        <ConfirmDialog
          trigger={<span className="hidden" />}
          open={!!pendingConfirm}
          onOpenChange={open => {
            if (!open) setPendingConfirm(null);
          }}
          title={pendingConfirm.confirm.title}
          description={pendingConfirm.confirm.description}
          confirmLabel={pendingConfirm.label}
          confirmClassName={
            pendingConfirm.variant === 'destructive' ? 'bg-destructive text-white hover:bg-destructive/90' : undefined
          }
          onConfirm={() => {
            pendingConfirm.onClick();
            setPendingConfirm(null);
          }}
        />
      )}
    </div>
  );
}
