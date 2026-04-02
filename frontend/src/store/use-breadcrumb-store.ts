import { create } from 'zustand';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbState {
  title: string;
  crumbs: BreadcrumbItem[];
  back?: string;
  setTitle: (title: string) => void;
  setCrumbs: (crumbs: BreadcrumbItem[]) => void;
  set: (title: string, crumbs?: BreadcrumbItem[], back?: string) => void;
  reset: () => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>()(set => ({
  title: '',
  crumbs: [],
  back: undefined,

  setTitle: title => set({ title }),
  setCrumbs: crumbs => set({ crumbs }),
  set: (title, crumbs = [], back) => set({ title, crumbs, back }),
  reset: () => set({ title: '', crumbs: [], back: undefined }),
}));