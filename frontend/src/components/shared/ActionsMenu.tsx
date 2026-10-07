'use client';

import { EllipsisVertical } from 'lucide-react';
import { Fragment, type ReactNode, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { toGroups } from './actionGroups';

import type { LucideIcon } from 'lucide-react';

export type MobileAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'destructive';
  disabled?: boolean;
  /** Custom className merged onto the rendered menu item, e.g. for a semantic color that isn't `destructive`. */
  className?: string;
  node?: ReactNode;
  confirm?: {
    title: string;
    description: string;
  };
};

type Props = {
  /** One flat list, or groups. Groups are split by a separator, with no label. */
  actions: MobileAction[] | MobileAction[][];
  /** The element that opens the menu. Default: the `⋮` icon button. It must accept a ref and a click. */
  trigger?: ReactNode;
  /** Lets a parent keep its own UI visible while the menu is open (for example a hover-only actions cell). */
  onOpenChange?: (open: boolean) => void;
};

export function ActionsMenu({ actions, trigger, onOpenChange }: Props) {
  const [pendingConfirm, setPendingConfirm] = useState<MobileAction | null>(null);
  // The selected action. It runs when the menu has closed (see `onCloseAutoFocus`).
  const selectedAction = useRef<MobileAction | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const groups = toGroups(actions);

  // `onCloseAutoFocus` skips the default focus return, so an action that does not move focus (export, copy id)
  // would leave it on <body> and a keyboard user would lose their place.
  // The next frame lets an action that takes focus (inline rename, a dialog) do it first.
  const restoreFocusIfLost = () =>
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) triggerRef.current?.focus();
    });

  return (
    <div data-slot="actions-menu" className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
      {groups.length > 0 && (
        <DropdownMenu onOpenChange={onOpenChange}>
          <DropdownMenuTrigger ref={triggerRef} asChild>
            {trigger ?? (
              <Button variant="ghost" size="icon-lg" className="text-muted-foreground">
                <EllipsisVertical className="size-5" />
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="w-52"
            // Run the action after the menu is gone, and do not move the focus back to the trigger.
            // Else an action that takes the focus (inline rename, a dialog) would lose it to the
            // menu focus trap or to the trigger, and the rename input would blur and cancel at once.
            onCloseAutoFocus={event => {
              const action = selectedAction.current;
              if (!action) return;
              event.preventDefault();
              selectedAction.current = null;
              if (action.confirm) {
                setPendingConfirm(action);
              } else {
                action.onClick();
                restoreFocusIfLost();
              }
            }}
          >
            {groups.map((group, index) => (
              <Fragment key={group.map(action => action.label).join('|')}>
                {index > 0 && <DropdownMenuSeparator />}
                {group.map(action => (
                  <DropdownMenuItem
                    key={action.label}
                    disabled={action.disabled}
                    onSelect={() => {
                      selectedAction.current = action;
                    }}
                    variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                    className={action.className}
                  >
                    <action.icon />
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {pendingConfirm?.confirm && (
        <ConfirmDialog
          open={!!pendingConfirm}
          onOpenChange={open => {
            if (!open) setPendingConfirm(null);
          }}
          // The dialog would return the focus to the menu item that opened it, which no longer exists.
          // Radix does this in a timeout after the dialog unmounts, so a focus check on close can run too early.
          onCloseAutoFocus={event => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          title={pendingConfirm.confirm.title}
          description={pendingConfirm.confirm.description}
          confirmLabel={pendingConfirm.label}
          confirmClassName={
            pendingConfirm.variant === 'destructive'
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : undefined
          }
          onConfirm={() => {
            // The dialog closes itself after this, and `onCloseAutoFocus` restores the focus.
            pendingConfirm.onClick();
            setPendingConfirm(null);
          }}
        />
      )}
    </div>
  );
}
