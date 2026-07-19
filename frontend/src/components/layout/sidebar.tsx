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
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { LogoutButton } from '@/features/auth/components/logout-button';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

type NavItem = {
  labelKey: string;
  href: string | null;
  icon: React.ElementType;
  disabled?: boolean;
};

type NavSection = {
  labelKey: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    labelKey: 'learning',
    items: [
      { labelKey: 'dashboard', href: Routes.DASHBOARD, icon: LayoutDashboard },
      { labelKey: 'review_now', href: Routes.REVIEW, icon: RefreshCw },
    ],
  },
  {
    labelKey: 'library',
    items: [
      { labelKey: 'tests', href: Routes.TESTS, icon: BookOpen },
      { labelKey: 'notes', href: Routes.NOTES, icon: FileText },
      { labelKey: 'questions', href: null, icon: Grid3X3, disabled: true },
    ],
  },
  {
    labelKey: 'analytics',
    items: [
      { labelKey: 'test_history', href: Routes.HISTORY, icon: History },
      { labelKey: 'progress_stats', href: Routes.STATS, icon: BarChart2, disabled: true },
    ],
  },
  {
    labelKey: 'dev',
    items: [{ labelKey: 'sandbox', href: Routes.SANDBOX, icon: FlaskConical }],
  },
];

export function Sidebar() {
  const t = useTranslations('sidebar');
  const tApp = useTranslations('app');
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-15' : 'w-64'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center border-b border-sidebar-border px-3 py-3.5',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!collapsed && <span className="text-sm font-semibold text-sidebar-foreground truncate">{tApp('title')}</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t('expand') : t('collapse')}
          className="flex items-center justify-center size-7 rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {sections.map(section => (
          <div key={section.labelKey}>
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {t(section.labelKey)}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = item.href !== null && (pathname === item.href || pathname.startsWith(item.href + '/'));
                const label = t(item.labelKey);

                if (item.disabled || item.href === null) {
                  return (
                    <li key={item.labelKey}>
                      <span
                        title={collapsed ? `${label} (${t('coming_soon')})` : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg text-sm cursor-not-allowed opacity-40 text-sidebar-muted py-2',
                          collapsed ? 'justify-center px-0' : 'px-3'
                        )}
                      >
                        <Icon size={17} className="shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="truncate flex-1">{label}</span>
                            <span className="text-[10px] font-medium bg-sidebar-accent px-1.5 py-0.5 rounded-full">
                              {t('soon')}
                            </span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.labelKey}>
                    <Link
                      href={item.href}
                      title={collapsed ? label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors py-2',
                        'text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                        isActive && 'bg-sidebar-accent text-sidebar-foreground',
                        collapsed ? 'justify-center px-0' : 'px-3'
                      )}
                    >
                      <Icon size={17} className="shrink-0" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom — settings + logout */}
      <div className="border-t border-sidebar-border px-2 py-3 space-y-0.5">
        <Link
          href={Routes.SETTINGS}
          title={collapsed ? t('profile_and_settings') : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors py-2',
            'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            pathname === Routes.SETTINGS && 'bg-sidebar-accent text-sidebar-foreground',
            collapsed ? 'justify-center px-0' : 'px-3'
          )}
        >
          <Settings size={17} className="shrink-0" />
          {!collapsed && <span>{t('profile_and_settings')}</span>}
        </Link>
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  );
}
