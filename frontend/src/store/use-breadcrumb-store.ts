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
  setActions: (actions: ReactNode) => void;
  set: (title: string, crumbs?: BreadcrumbItem[], back?: string) => void;
  reset: () => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>()(set => ({
  title: '',
  crumbs: [],
  back: undefined,
  actions: undefined,

  setActions: actions => set({ actions }),
  set: (title, crumbs = [], back) => set({ title, crumbs, back }),
  reset: () => set({ title: '', crumbs: [], back: undefined, actions: undefined }),
}));
