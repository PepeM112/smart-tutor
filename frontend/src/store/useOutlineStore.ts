import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_OUTLINE_WIDTH = 264;
export const MIN_OUTLINE_WIDTH = 200;

type OutlineState = {
  /** Width in px by the `storageKey` of the column. A column with no entry uses `DEFAULT_OUTLINE_WIDTH`. */
  widths: Record<string, number>;
  /** The `storageKey` of the outline column on the page now, or null when the page has none. */
  activeKey: string | null;
  /** Desktop: the column is open. */
  isOpen: boolean;
  /** The column closed itself to make room for Ask AI. Only then does it open again when Ask AI closes. */
  isAutoCollapsed: boolean;
  /** Phone: the Contents drawer is open. */
  isDrawerOpen: boolean;
  register: (key: string) => void;
  unregister: () => void;
  setWidth: (key: string, width: number) => void;
  /** The user opens or closes the column: this ends an auto-collapse. */
  setOpen: (open: boolean) => void;
  autoCollapse: () => void;
  autoRestore: () => void;
  setDrawerOpen: (open: boolean) => void;
};

export const selectOutlineWidth = (state: Pick<OutlineState, 'widths' | 'activeKey'>): number =>
  (state.activeKey && state.widths[state.activeKey]) || DEFAULT_OUTLINE_WIDTH;

export const useOutlineStore = create<OutlineState>()(
  persist(
    set => ({
      widths: {},
      activeKey: null,
      isOpen: true,
      isAutoCollapsed: false,
      isDrawerOpen: false,
      register: key => set({ activeKey: key, isOpen: true, isAutoCollapsed: false, isDrawerOpen: false }),
      unregister: () => set({ activeKey: null, isOpen: true, isAutoCollapsed: false, isDrawerOpen: false }),
      setWidth: (key, width) =>
        set(state => ({ widths: { ...state.widths, [key]: Math.max(MIN_OUTLINE_WIDTH, Math.round(width)) } })),
      setOpen: open => set({ isOpen: open, isAutoCollapsed: false }),
      autoCollapse: () => set(state => (state.isOpen ? { isOpen: false, isAutoCollapsed: true } : state)),
      autoRestore: () => set(state => (state.isAutoCollapsed ? { isOpen: true, isAutoCollapsed: false } : state)),
      setDrawerOpen: open => set({ isDrawerOpen: open }),
    }),
    {
      name: 'outline-panel',
      version: 1,
      partialize: state => ({ widths: state.widths }),
    }
  )
);
