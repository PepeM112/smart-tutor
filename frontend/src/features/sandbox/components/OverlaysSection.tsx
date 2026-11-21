'use client';

import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { HoverHint } from '@/components/ui/hover-hint';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';

import { SandboxDemo, SandboxSection } from './SandboxSection';

export function OverlaysSection() {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isChecked, setIsChecked] = useState(true);
  const [sortValue, setSortValue] = useState('updated');

  return (
    <SandboxSection id="overlays" title="Dialogs, menus and popovers">
      <SandboxDemo label="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename test</DialogTitle>
              <DialogDescription>The new name shows in every list.</DialogDescription>
            </DialogHeader>
            <Input aria-label="Name" defaultValue="Spanish irregular verbs" />
            <DialogFooter showCloseButton>
              <Button>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SandboxDemo>

      <SandboxDemo label="Confirm dialog">
        <div className="flex flex-wrap gap-3">
          <ConfirmDialog
            trigger={<Button variant="outline">Uncontrolled</Button>}
            title="Leave this page?"
            description="Your changes are not saved."
            onConfirm={() => undefined}
          />
          <Button variant="destructive" icon={Trash2} onClick={() => setIsConfirmOpen(true)}>
            Controlled, destructive
          </Button>
          <ConfirmDialog
            open={isConfirmOpen}
            onOpenChange={setIsConfirmOpen}
            title="Delete this test?"
            description="It moves to the Trash for 30 days."
            confirmLabel="Delete"
            confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-none"
            onConfirm={() => setIsConfirmOpen(false)}
          />
        </div>
      </SandboxDemo>

      <SandboxDemo label="Dropdown menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Open menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Test</DropdownMenuLabel>
            <DropdownMenuItem>
              <Pencil /> Edit <DropdownMenuShortcut>E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sort by</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={sortValue} onValueChange={setSortValue}>
                  <DropdownMenuRadioItem value="updated">Last updated</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="title">Title</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuCheckboxItem checked={isChecked} onCheckedChange={setIsChecked}>
              Show archived
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SandboxDemo>

      <SandboxDemo label="Floating card, hover card, tooltip and hover hint">
        <div className="flex flex-wrap items-center gap-4">
          <FloatingCard>
            <FloatingCardTrigger asChild>
              <Button variant="outline">Floating card</Button>
            </FloatingCardTrigger>
            <FloatingCardContent className="w-64">
              A popover with free content, closed by a click outside.
            </FloatingCardContent>
          </FloatingCard>
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="link">Hover card</Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-56 p-3 text-sm">Opens on hover and on focus.</HoverCardContent>
          </HoverCard>
          <Tooltip content="A click pins this tooltip." />
          <HoverHint label="Bold" shortcut="Ctrl+B">
            <Button variant="outline" size="sm">
              Hover hint
            </Button>
          </HoverHint>
        </div>
      </SandboxDemo>
    </SandboxSection>
  );
}
