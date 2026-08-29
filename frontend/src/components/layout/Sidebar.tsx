'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { SidebarNav } from './SidebarNav';

export function Sidebar() {
  const t = useTranslations();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-15' : 'w-64'
      )}
    >
      <div
        className={cn(
          'flex items-center border-b border-sidebar-border px-3 py-3.5',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!collapsed && <span className="text-sm font-semibold text-sidebar-foreground truncate">{t('app.title')}</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          className="flex items-center justify-center size-7 rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}
