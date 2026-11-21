'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { useAuthStore } from '@/features/auth/store/authStore';
import { fadeWithWidthClass } from '@/lib/panelMotion';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { ADMIN_SECTION, isNavItemActive, NAV_SECTIONS, type NavSection, visibleNavSections } from './navItems';
import { sidebarItemClass } from './sidebarItemClass';
import { SidebarLabel } from './SidebarLabel';
import { useFavoriteNavItems } from './useFavoriteNavItems';
import { UserAvatar } from './UserAvatar';

type SidebarNavProps = {
  collapsed?: boolean;
};

export function SidebarNav({ collapsed = false }: SidebarNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const favorites = useFavoriteNavItems();
  const role = useAuthStore(s => s.user?.role);

  // Favorites sit after Analytics and before Admin. The favorites section is left out when there are none.
  const allSections = useMemo<NavSection[]>(
    () =>
      visibleNavSections(
        [
          ...NAV_SECTIONS,
          ...(favorites.length === 0 ? [] : [{ labelKey: 'sidebar.favorites', items: favorites }]),
          ADMIN_SECTION,
        ],
        role
      ),
    [favorites, role]
  );

  return (
    <>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {allSections.map(section => {
          return (
            <div key={section.labelKey} role="group" aria-labelledby={`sidebar-section-${section.labelKey}`}>
              {/*
                Always mounted with a fixed height, so the nav does not jump when the sidebar toggles. It is
                hidden from assistive technology while railed, but `aria-labelledby` still reads it as the group name.
              */}
              <p
                id={`sidebar-section-${section.labelKey}`}
                aria-hidden={collapsed || undefined}
                className={cn(
                  'mb-1 h-5 truncate px-3 text-[13px] leading-5 font-medium text-sidebar-muted',
                  fadeWithWidthClass(!collapsed)
                )}
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
                          className="flex items-center gap-2.5 overflow-hidden rounded-lg px-3.5 py-2 text-sm cursor-not-allowed opacity-40 text-sidebar-muted"
                        >
                          <Icon size={16} className="shrink-0" />
                          <SidebarLabel collapsed={collapsed} className="flex-1">
                            {label}
                          </SidebarLabel>
                          <SidebarLabel
                            collapsed={collapsed}
                            className="text-[10px] font-medium bg-sidebar-accent px-1.5 py-0.5 rounded-full"
                          >
                            {t('sidebar.soon')}
                          </SidebarLabel>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.labelKey}>
                      <Link
                        href={item.href}
                        title={collapsed ? label : undefined}
                        aria-label={collapsed ? label : undefined}
                        className={sidebarItemClass(isActive)}
                      >
                        <Icon size={16} className={cn('shrink-0', isActive ? 'text-primary' : 'text-sidebar-muted')} />
                        <SidebarLabel collapsed={collapsed}>{label}</SidebarLabel>
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
          aria-label={collapsed ? t('sidebar.profile_and_settings') : undefined}
          className={sidebarItemClass(pathname === Routes.SETTINGS)}
        >
          {/* 20px circle in the 16px icon slot: the negative margin keeps the label where the icon rows have it. */}
          <UserAvatar className="size-5 -mx-0.5 text-xs" />
          <SidebarLabel collapsed={collapsed}>{t('sidebar.profile_and_settings')}</SidebarLabel>
        </Link>
        <LogoutButton collapsed={collapsed} />
      </div>
    </>
  );
}
