import {
  BarChart2,
  BookOpen,
  FlaskConical,
  Folder,
  GraduationCap,
  Grid3X3,
  History,
  LayoutDashboard,
  RefreshCw,
  School,
  Trash2,
} from 'lucide-react';

import { UserRole } from '@/client';
import { Routes } from '@/lib/routes';

import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  /** Translation key. For a dynamic item (a favorite note) it is only a unique React key. */
  labelKey: string;
  /** Text shown instead of `t(labelKey)`. */
  label?: string;
  /** Replaces the pathname match, for items whose href alone does not tell if they are active. */
  isActive?: boolean;
  href: string | null;
  icon: LucideIcon;
  disabled?: boolean;
  /** Only users with this role see the item. Leave it out for an item for everyone. */
  requiredRole?: UserRole;
};

export type NavSection = {
  labelKey: string;
  items: NavItem[];
};

/** Every destination of the app nav, once. The sidebar, the tab bar and the More sheet pick from here. */
export const NAV_ITEMS = {
  dashboard: { labelKey: 'sidebar.dashboard', href: Routes.DASHBOARD, icon: LayoutDashboard },
  review: { labelKey: 'sidebar.review_now', href: Routes.REVIEW, icon: RefreshCw },
  tests: { labelKey: 'sidebar.tests', href: Routes.TESTS, icon: BookOpen },
  files: { labelKey: 'sidebar.files', href: Routes.FILES, icon: Folder },
  questions: { labelKey: 'sidebar.questions', href: Routes.QUESTIONS, icon: Grid3X3 },
  trash: { labelKey: 'sidebar.trash', href: Routes.TRASH, icon: Trash2 },
  courses: { labelKey: 'sidebar.courses', href: Routes.COURSES, icon: GraduationCap },
  classrooms: { labelKey: 'sidebar.classrooms', href: Routes.CLASSROOMS, icon: School },
  history: { labelKey: 'sidebar.test_history', href: Routes.HISTORY, icon: History },
  stats: { labelKey: 'sidebar.progress_stats', href: Routes.STATS, icon: BarChart2, disabled: true },
  sandbox: { labelKey: 'sidebar.sandbox', href: Routes.SANDBOX, icon: FlaskConical, requiredRole: UserRole.ADMIN },
} satisfies Record<string, NavItem>;

export const NAV_SECTIONS: NavSection[] = [
  { labelKey: 'sidebar.learning', items: [NAV_ITEMS.dashboard, NAV_ITEMS.review] },
  { labelKey: 'sidebar.library', items: [NAV_ITEMS.tests, NAV_ITEMS.files, NAV_ITEMS.questions, NAV_ITEMS.trash] },
  { labelKey: 'sidebar.spaces', items: [NAV_ITEMS.courses, NAV_ITEMS.classrooms] },
  { labelKey: 'sidebar.analytics', items: [NAV_ITEMS.history, NAV_ITEMS.stats] },
];

/** Last section of the sidebar, after the favorites. A user without the role gets no section at all. */
export const ADMIN_SECTION: NavSection = { labelKey: 'sidebar.admin', items: [NAV_ITEMS.sandbox] };

/** The plain link tabs of the phone bar. It also has the AI and Spaces tabs, which are not links, and More. */
export const TAB_ITEMS: NavItem[] = [NAV_ITEMS.dashboard, NAV_ITEMS.files];

/** The menu of the Spaces tab. */
export const SPACE_ITEMS: NavItem[] = [NAV_ITEMS.courses, NAV_ITEMS.classrooms];

export const MORE_ITEMS: NavItem[] = [
  NAV_ITEMS.review,
  NAV_ITEMS.tests,
  NAV_ITEMS.questions,
  NAV_ITEMS.history,
  NAV_ITEMS.trash,
  NAV_ITEMS.sandbox,
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.isActive !== undefined) return item.isActive;
  return item.href !== null && (pathname === item.href || pathname.startsWith(item.href + '/'));
}

/** The items this role can see. The one filter for the sidebar, the tab bar and the More sheet. */
export function visibleNavItems(items: NavItem[], role: UserRole | undefined): NavItem[] {
  return items.filter(item => item.requiredRole === undefined || item.requiredRole === role);
}

/** Same filter for sections. A section with no visible item is dropped, so no empty heading shows. */
export function visibleNavSections(sections: NavSection[], role: UserRole | undefined): NavSection[] {
  return sections
    .map(section => ({ ...section, items: visibleNavItems(section.items, role) }))
    .filter(section => section.items.length > 0);
}
