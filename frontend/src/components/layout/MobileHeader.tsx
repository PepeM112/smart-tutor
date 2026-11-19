'use client';

import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';

import { SidebarNav } from './SidebarNav';

export function MobileHeader() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <header className="flex items-center gap-3 bg-sidebar px-4 py-3 shrink-0">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label={t('sidebar.open_menu')}
          >
            <Menu size={20} />
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <div className="flex items-center px-3 py-3.5">
            <span className="truncate font-serif text-[22px] font-medium text-sidebar-foreground">
              {t('app.title')}
            </span>
          </div>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <span className="min-w-0 flex-1 truncate font-serif text-xl font-medium text-sidebar-foreground">
        {t('app.title')}
      </span>
      <NotificationBell align="end" />
    </header>
  );
}
