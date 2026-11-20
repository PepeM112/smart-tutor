import { create } from 'zustand';

import type { ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbState {
  title: string;
  crumbs: BreadcrumbItem[];
  back?: string;
  actions?: ReactNode;
  /** The left side of the desktop header in place of the back arrow, the crumbs and the title (for example the Files folder path). */
  lead?: ReactNode;
  /** True when `lead` renders the page h1 itself, so `PageHeader` adds no hidden one. */
  leadHasHeading: boolean;
  /** A line under the title of the phone header (for example the progress of an exam). */
  subtitle?: string;
  setActions: (actions: ReactNode) => void;
  setLead: (lead: ReactNode, hasHeading?: boolean) => void;
  setSubtitle: (subtitle: string | undefined) => void;
  set: (title: string, crumbs?: BreadcrumbItem[], back?: string) => void;
  reset: () => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>()(set => ({
  title: '',
  crumbs: [],
  back: undefined,
  actions: undefined,
  lead: undefined,
  leadHasHeading: false,
  subtitle: undefined,

  setActions: actions => set({ actions }),
  setLead: (lead, hasHeading = false) => set({ lead, leadHasHeading: hasHeading }),
  setSubtitle: subtitle => set({ subtitle }),
  set: (title, crumbs = [], back) => set({ title, crumbs, back }),
  // The actions are not reset here: `usePageActions` clears them itself. A title change (a page that loads its
  // title) runs this reset and must not drop the actions that the page set once.
  reset: () => set({ title: '', crumbs: [], back: undefined }),
}));
