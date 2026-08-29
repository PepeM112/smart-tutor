'use client';

import {
  BarChart2,
  BookOpen,
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
import { useTranslations } from 'next-intl';

import { UserRole } from '@/client';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

type NavItem = {
  labelKey: string;
  href: string | null;
  icon: React.ElementType;
  disabled?: boolean;
  requiredRole?: UserRole;
};

type NavSection = {
  labelKey: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    labelKey: 'sidebar.learning',
    items: [
      { labelKey: 'sidebar.dashboard', href: Routes.DASHBOARD, icon: LayoutDashboard },
      { labelKey: 'sidebar.review_now', href: Routes.REVIEW, icon: RefreshCw },
    ],
  },
  {
    labelKey: 'sidebar.library',
    items: [
      { labelKey: 'sidebar.tests', href: Routes.TESTS, icon: BookOpen },
      { labelKey: 'sidebar.notes', href: Routes.NOTES, icon: FileText },
      { labelKey: 'sidebar.questions', href: Routes.QUESTIONS, icon: Grid3X3 },
    ],
  },
  {
    labelKey: 'sidebar.analytics',
    items: [
      { labelKey: 'sidebar.test_history', href: Routes.HISTORY, icon: History },
      { labelKey: 'sidebar.progress_stats', href: Routes.STATS, icon: BarChart2, disabled: true },
    ],
  },
  {
    labelKey: 'sidebar.dev',
    items: [{ labelKey: 'sidebar.sandbox', href: Routes.SANDBOX, icon: FlaskConical, requiredRole: UserRole.ADMIN }],
  },
];

type SidebarNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const userRole = useAuthStore(s => s.user?.role);

  return (
    <>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {sections.map(section => {
          const visibleItems = section.items.filter(item => !item.requiredRole || item.requiredRole === userRole);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.labelKey}>
              {!collapsed && <p className="px-3 mb-1 text-xs font-medium text-sidebar-muted">{t(section.labelKey)}</p>}
              <ul className="space-y-0.5">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const isActive =
                    item.href !== null && (pathname === item.href || pathname.startsWith(item.href + '/'));
                  const label = t(item.labelKey);

                  if (item.disabled || item.href === null) {
                    return (
                      <li key={item.labelKey}>
                        <span
                          title={collapsed ? `${label} (${t('sidebar.soon')})` : undefined}
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
                                {t('sidebar.soon')}
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
                        onClick={onNavigate}
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
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-2 py-3 space-y-0.5">
        <Link
          href={Routes.SETTINGS}
          onClick={onNavigate}
          title={collapsed ? t('sidebar.profile_and_settings') : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors py-2',
            'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            pathname === Routes.SETTINGS && 'bg-sidebar-accent text-sidebar-foreground',
            collapsed ? 'justify-center px-0' : 'px-3'
          )}
        >
          <Settings size={17} className="shrink-0" />
          {!collapsed && <span>{t('sidebar.profile_and_settings')}</span>}
        </Link>
        <LogoutButton collapsed={collapsed} />
      </div>
    </>
  );
}
