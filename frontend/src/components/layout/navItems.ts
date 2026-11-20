import {
  BarChart2,
  BookOpen,
  Folder,
  GraduationCap,
  Grid3X3,
  History,
  LayoutDashboard,
  RefreshCw,
  School,
  Trash2,
} from 'lucide-react';

import { Routes } from '@/lib/routes';

import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  /** Translation key. For a dynamic item (a favorite note) it is only a unique React key. */
  labelKey: string;
  /** Text shown instead of `t(labelKey)`. */
  label?: string;
  /** A shorter text for the phone tab bar, where the label has 56px. */
  shortLabelKey?: string;
  /** Replaces the pathname match, for items whose href alone does not tell if they are active. */
  isActive?: boolean;
  href: string | null;
  icon: LucideIcon;
  disabled?: boolean;
};

export type NavSection = {
  labelKey: string;
  items: NavItem[];
};

/** Every destination of the app nav, once. The sidebar, the tab bar and the More sheet pick from here. */
export const NAV_ITEMS = {
  dashboard: { labelKey: 'sidebar.dashboard', href: Routes.DASHBOARD, icon: LayoutDashboard },
  review: {
    labelKey: 'sidebar.review_now',
    shortLabelKey: 'mobile_nav.review',
    href: Routes.REVIEW,
    icon: RefreshCw,
  },
  tests: { labelKey: 'sidebar.tests', href: Routes.TESTS, icon: BookOpen },
  files: { labelKey: 'sidebar.files', href: Routes.FILES, icon: Folder },
  questions: { labelKey: 'sidebar.questions', href: Routes.QUESTIONS, icon: Grid3X3 },
  trash: { labelKey: 'sidebar.trash', href: Routes.TRASH, icon: Trash2 },
  courses: { labelKey: 'sidebar.courses', href: Routes.COURSES, icon: GraduationCap },
  classrooms: { labelKey: 'sidebar.classrooms', href: Routes.CLASSROOMS, icon: School },
  history: { labelKey: 'sidebar.test_history', href: Routes.HISTORY, icon: History },
  stats: { labelKey: 'sidebar.progress_stats', href: Routes.STATS, icon: BarChart2, disabled: true },
} satisfies Record<string, NavItem>;

export const NAV_SECTIONS: NavSection[] = [
  { labelKey: 'sidebar.learning', items: [NAV_ITEMS.dashboard, NAV_ITEMS.review] },
  { labelKey: 'sidebar.library', items: [NAV_ITEMS.tests, NAV_ITEMS.files, NAV_ITEMS.questions, NAV_ITEMS.trash] },
  { labelKey: 'sidebar.spaces', items: [NAV_ITEMS.courses, NAV_ITEMS.classrooms] },
  { labelKey: 'sidebar.analytics', items: [NAV_ITEMS.history, NAV_ITEMS.stats] },
];

/** The four tabs of the phone bar. The rest of the nav is in the More sheet (`MORE_ITEMS`). */
export const TAB_ITEMS: NavItem[] = [NAV_ITEMS.dashboard, NAV_ITEMS.review, NAV_ITEMS.files, NAV_ITEMS.courses];

export const MORE_ITEMS: NavItem[] = [
  NAV_ITEMS.tests,
  NAV_ITEMS.questions,
  NAV_ITEMS.classrooms,
  NAV_ITEMS.history,
  NAV_ITEMS.trash,
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.isActive !== undefined) return item.isActive;
  return item.href !== null && (pathname === item.href || pathname.startsWith(item.href + '/'));
}
