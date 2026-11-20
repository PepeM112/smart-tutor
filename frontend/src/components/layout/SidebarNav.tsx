'use client';

import { Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { isNavItemActive, NAV_SECTIONS, type NavSection } from './navItems';
import { useFavoriteNavItems } from './useFavoriteNavItems';

type SidebarNavProps = {
  collapsed?: boolean;
};

export function SidebarNav({ collapsed = false }: SidebarNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const favorites = useFavoriteNavItems();

  // Favorites sit after Analytics. The section is left out when there are none.
  const allSections = useMemo<NavSection[]>(
    () =>
      favorites.length === 0 ? NAV_SECTIONS : [...NAV_SECTIONS, { labelKey: 'sidebar.favorites', items: favorites }],
    [favorites]
  );

  return (
    <>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {allSections.map(section => {
          return (
            <div key={section.labelKey} role="group" aria-labelledby={`sidebar-section-${section.labelKey}`}>
              {/* Stays in the DOM when collapsed so screen readers still get the group name. */}
              <p
                id={`sidebar-section-${section.labelKey}`}
                className={collapsed ? 'sr-only' : 'px-3 mb-1 text-[13px] font-medium text-sidebar-muted'}
              >
                {t(section.labelKey)}
              </p>
              <ul className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const isActive = isNavItemActive(item, pathname);
                  const label = item.label ?? t(item.labelKey);

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
                        title={collapsed ? label : undefined}
                        className={cn(
                          'flex h-8 items-center gap-2.5 rounded-lg text-[15px] transition-colors',
                          'text-sidebar-foreground hover:bg-sidebar-accent',
                          isActive && 'bg-sidebar-accent font-medium',
                          collapsed ? 'justify-center px-0' : 'px-3'
                        )}
                      >
                        <Icon size={16} className={cn('shrink-0', isActive ? 'text-primary' : 'text-sidebar-muted')} />
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

      <div className="px-2 py-3 space-y-0.5">
        <Link
          href={Routes.SETTINGS}
          title={collapsed ? t('sidebar.profile_and_settings') : undefined}
          className={cn(
            'flex h-8 items-center gap-2.5 rounded-lg text-[15px] transition-colors',
            'text-sidebar-foreground hover:bg-sidebar-accent',
            pathname === Routes.SETTINGS && 'bg-sidebar-accent font-medium',
            collapsed ? 'justify-center px-0' : 'px-3'
          )}
        >
          <Settings
            size={16}
            className={cn('shrink-0', pathname === Routes.SETTINGS ? 'text-primary' : 'text-sidebar-muted')}
          />
          {!collapsed && <span>{t('sidebar.profile_and_settings')}</span>}
        </Link>
        <LogoutButton collapsed={collapsed} />
      </div>
    </>
  );
}
