'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { SplitPane } from '@/components/shared/SplitPane';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { DEMO_ITEMS, DEMO_LONG_TEXT } from '../demoData';

import { SandboxDemo, SandboxSection } from './SandboxSection';

const OUTLINE_ROW_CLASS =
  'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted';

export function PanelsSection() {
  return (
    <SandboxSection id="panels" title="Sheets, drawers, outline and split pane">
      <SandboxDemo label="Sheet">
        <div className="flex flex-wrap gap-3">
          {(['left', 'right'] as const).map(side => (
            <Sheet key={side}>
              <SheetTrigger asChild>
                <Button variant="outline" className="capitalize">
                  {side} sheet
                </Button>
              </SheetTrigger>
              <SheetContent side={side} title={`${side} sheet`}>
                <div className="p-4 pt-12 text-sm">{DEMO_LONG_TEXT}</div>
              </SheetContent>
            </Sheet>
          ))}
        </div>
      </SandboxDemo>

      <SandboxDemo label="Drawer">
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">Bottom drawer</Button>
          </DrawerTrigger>
          <DrawerContent title="Bottom drawer">
            <DrawerHeader>
              <DrawerTitle>Bottom drawer</DrawerTitle>
              <DrawerDescription>The panel of the phone layout.</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button>Save</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </SandboxDemo>

      <SandboxDemo label="Outline">
        <OutlineExample />
      </SandboxDemo>

      <SandboxDemo label="Split pane">
        <div className="h-64 overflow-hidden rounded-xl border border-border">
          <SplitPane
            storageKey="sandbox-split-pane"
            className="h-full"
            main={<p className="p-4 text-sm">{DEMO_LONG_TEXT}</p>}
            side={<p className="p-4 text-sm">The side pane. Drag the divider, or use the arrow keys on it.</p>}
            sideClassName="bg-card"
          />
        </div>
      </SandboxDemo>
    </SandboxSection>
  );
}

/** The inside of an outline column, on its own ground. The real column is page chrome and cannot sit in a gallery. */
function OutlineExample() {
  const [tab, setTab] = useState('content');
  const [selectedId, setSelectedId] = useState(DEMO_ITEMS[0].id);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <nav aria-label="Outline example" className="max-w-xs space-y-4 rounded-xl bg-outline px-2.5 py-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="gap-0.5 rounded-lg border-0 bg-muted p-0.5">
          {['content', 'members'].map(value => (
            <TabsTrigger
              key={value}
              value={value}
              className="mb-0 flex-1 justify-center rounded-md border-0 px-2 py-1 font-normal capitalize data-[state=active]:bg-card data-[state=active]:font-medium data-[state=active]:shadow-card"
            >
              {value}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <section>
        <h3 className="px-2 pb-1">
          <button
            type="button"
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed(value => !value)}
            className="flex w-full items-center gap-1 rounded text-left text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', isCollapsed && '-rotate-90')} />
            Week 1
          </button>
        </h3>
        {!isCollapsed && (
          <ul>
            {DEMO_ITEMS.slice(0, 4).map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === selectedId ? 'true' : undefined}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(OUTLINE_ROW_CLASS, item.id === selectedId && 'bg-muted font-medium')}
                >
                  <span className="truncate">{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </nav>
  );
}
