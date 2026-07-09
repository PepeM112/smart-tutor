'use client';

import {
  BarChart2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  Grid3X3,
  History,
  LayoutDashboard,
  RefreshCw,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { LogoutButton } from '@/features/auth/components/logout-button';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

type NavItem = {
  label: string;
  href: string | null;
  icon: React.ElementType;
  disabled?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    label: 'Learning',
    items: [
      { label: 'Dashboard', href: Routes.DASHBOARD, icon: LayoutDashboard },
      { label: 'Review Now', href: Routes.REVIEW, icon: RefreshCw },
    ],
  },
  {
    label: 'Library',
    items: [
      { label: 'Tests', href: Routes.TESTS, icon: BookOpen },
      { label: 'Notes', href: Routes.NOTES, icon: FileText },
      { label: 'Questions', href: null, icon: Grid3X3, disabled: true },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Test History', href: Routes.HISTORY, icon: History },
      { label: 'Progress Stats', href: Routes.STATS, icon: BarChart2, disabled: true },
    ],
  },
  {
    label: 'Dev',
    items: [{ label: 'Sandbox', href: Routes.SANDBOX, icon: FlaskConical }],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-secondary border-r border-border shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-15' : 'w-64'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center border-b border-border px-3 py-3.5',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!collapsed && <span className="text-sm font-semibold text-foreground truncate">SmartTutor</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {sections.map(section => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = item.href !== null && (pathname === item.href || pathname.startsWith(item.href + '/'));

                if (item.disabled || item.href === null) {
                  return (
                    <li key={item.label}>
                      <span
                        title={collapsed ? `${item.label} (Coming soon)` : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg text-sm cursor-not-allowed opacity-40 text-muted-foreground py-2',
                          collapsed ? 'justify-center px-0' : 'px-3'
                        )}
                      >
                        <Icon size={17} className="shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="truncate flex-1">{item.label}</span>
                            <span className="text-[10px] font-medium bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">
                              Soon
                            </span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors py-2',
                        'text-foreground/70 hover:bg-muted hover:text-foreground',
                        isActive && 'bg-primary/10 text-primary',
                        collapsed ? 'justify-center px-0' : 'px-3'
                      )}
                    >
                      <Icon size={17} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom — settings + logout */}
      <div className="border-t border-border px-2 py-3 space-y-0.5">
        <Link
          href={Routes.SETTINGS}
          title={collapsed ? 'Profile & Settings' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors py-2',
            'text-foreground/60 hover:bg-muted hover:text-foreground',
            pathname === Routes.SETTINGS && 'bg-primary/10 text-primary',
            collapsed ? 'justify-center px-0' : 'px-3'
          )}
        >
          <Settings size={17} className="shrink-0" />
          {!collapsed && <span>Profile & Settings</span>}
        </Link>
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  );
}
