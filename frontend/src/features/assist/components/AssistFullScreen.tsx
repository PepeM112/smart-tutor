'use client';

import { Drawer as DrawerPrimitive } from 'vaul';

import { Drawer, DrawerPortal, DrawerTitle } from '@/components/ui/drawer';

import { useAssistPanelStore } from '../store/useAssistPanelStore';

import { AssistSheet } from './AssistSheet';

/**
 * Below `lg` the Ask AI sheet covers the screen. Esc and the close button in the sheet header close it.
 * It is a vaul drawer, not a Radix dialog: vaul lifts the sheet above the iOS keyboard (`repositionInputs`,
 * on by default), so the composer stays visible. `handleOnly` stops a swipe in the chat from closing it.
 */
export function AssistFullScreen() {
  const setOpen = useAssistPanelStore(s => s.setOpen);

  return (
    <Drawer open onOpenChange={setOpen} handleOnly>
      <DrawerPortal>
        <DrawerPrimitive.Content
          data-slot="drawer-content"
          aria-describedby={undefined}
          className="fixed inset-x-0 top-0 z-50 flex h-dvh flex-col bg-card text-card-foreground outline-none"
        >
          <AssistSheet heading={DrawerTitle} />
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}
