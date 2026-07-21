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
  setTitle: (title: string) => void;
  setCrumbs: (crumbs: BreadcrumbItem[]) => void;
  setActions: (actions: ReactNode) => void;
  set: (title: string, crumbs?: BreadcrumbItem[], back?: string) => void;
  reset: () => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>()(set => ({
  title: '',
  crumbs: [],
  back: undefined,
  actions: undefined,

  setTitle: title => set({ title }),
  setCrumbs: crumbs => set({ crumbs }),
  setActions: actions => set({ actions }),
  set: (title, crumbs = [], back) => set({ title, crumbs, back }),
  reset: () => set({ title: '', crumbs: [], back: undefined, actions: undefined }),
}));
