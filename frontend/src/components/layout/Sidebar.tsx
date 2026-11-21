'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { fadeWithWidthClass, PANEL_WIDTH_CLASS } from '@/lib/panelMotion';
import { cn } from '@/lib/utils';

import { SidebarNav } from './SidebarNav';

export function Sidebar() {
  const t = useTranslations();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-sidebar shrink-0 overflow-hidden',
        PANEL_WIDTH_CLASS,
        collapsed ? 'w-15' : 'w-55'
      )}
    >
      <div className={cn('flex items-center px-3 py-3.5', collapsed ? 'flex-col gap-2' : 'justify-between')}>
        {/* Out of the flow while railed, so the bell and the toggle stack as before. It fades, it does not pop. */}
        <span
          aria-hidden={collapsed || undefined}
          className={cn(
            'truncate font-serif text-[22px] font-medium text-sidebar-foreground',
            fadeWithWidthClass(!collapsed),
            collapsed && 'pointer-events-none absolute'
          )}
        >
          {t('app.title')}
        </span>
        <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
          <NotificationBell side="right" />
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            className="flex items-center justify-center size-7 rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
      </div>

      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}
