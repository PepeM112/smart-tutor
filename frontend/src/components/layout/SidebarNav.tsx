'use client';

import {
  BarChart2,
  BookOpen,
  Folder,
  GraduationCap,
  Grid3X3,
  History,
  LayoutDashboard,
  School,
  RefreshCw,
  Settings,
  Star,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { useFileTree } from '@/features/files/hooks/useFileTree';
import { displayTitle } from '@/lib/displayTitle';
import { noteHref, parseSlugId, Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

type NavItem = {
  /** Translation key. For a dynamic item (a favorite note) it is only a unique React key. */
  labelKey: string;
  /** Text shown instead of `t(labelKey)`. */
  label?: string;
  /** Replaces the pathname match, for items whose href alone does not tell if they are active. */
  isActive?: boolean;
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
      { labelKey: 'sidebar.files', href: Routes.FILES, icon: Folder },
      { labelKey: 'sidebar.questions', href: Routes.QUESTIONS, icon: Grid3X3 },
      { labelKey: 'sidebar.trash', href: Routes.TRASH, icon: Trash2 },
    ],
  },
  {
    labelKey: 'sidebar.spaces',
    items: [
      { labelKey: 'sidebar.courses', href: Routes.COURSES, icon: GraduationCap },
      { labelKey: 'sidebar.classrooms', href: Routes.CLASSROOMS, icon: School },
    ],
  },
  {
    labelKey: 'sidebar.analytics',
    items: [
      { labelKey: 'sidebar.test_history', href: Routes.HISTORY, icon: History },
      { labelKey: 'sidebar.progress_stats', href: Routes.STATS, icon: BarChart2, disabled: true },
    ],
  },
];

type SidebarNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { notes } = useFileTree();

  // Favorites sit after Analytics. The section is left out when there are none.
  const allSections = useMemo<NavSection[]>(() => {
    const openNoteId = activeNoteId(pathname);
    const favorites: NavItem[] = notes
      .filter(note => note.isFavorite)
      .sort((a, b) => (b.favoritedAt?.getTime() ?? 0) - (a.favoritedAt?.getTime() ?? 0))
      .map(note => ({
        labelKey: `favorite-${note.id}`,
        label: displayTitle(note.title, t),
        href: noteHref(note),
        icon: Star,
        isActive: note.id === openNoteId,
      }));
    if (favorites.length === 0) return sections;
    return [...sections, { labelKey: 'sidebar.favorites', items: favorites }];
  }, [notes, pathname, t]);

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
                  const isActive =
                    item.isActive ??
                    (item.href !== null && (pathname === item.href || pathname.startsWith(item.href + '/')));
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
                        onClick={onNavigate}
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
          onClick={onNavigate}
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

/** The note id of a `/notes/<slug>-<id>` path, or null on any other path. */
function activeNoteId(pathname: string): string | null {
  if (!pathname.startsWith('/notes/')) return null;
  const segment = pathname.split('/')[2];
  return segment ? parseSlugId(segment) : null;
}
