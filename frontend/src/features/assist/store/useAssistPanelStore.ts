import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_ASSIST_WIDTH = 340;
export const MIN_ASSIST_WIDTH = 300;

/**
 * The width is kept per kind of page, not per URL: the second path segment is an id on most routes
 * (`/notes/<slug>-<id>`), so a key per URL would give every note its own width and grow the store without limit.
 */
export const assistPageKey = (pathname: string): string => `/${pathname.split('/')[1] ?? ''}`;

type AssistPanelState = {
  isOpen: boolean;
  /** Width in px by `assistPageKey`. A page with no entry uses `DEFAULT_ASSIST_WIDTH`. */
  widths: Record<string, number>;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setWidth: (pageKey: string, width: number) => void;
  resetWidth: (pageKey: string) => void;
};

export const selectAssistWidth =
  (pageKey: string) =>
  (state: Pick<AssistPanelState, 'widths'>): number =>
    state.widths[pageKey] ?? DEFAULT_ASSIST_WIDTH;

export const useAssistPanelStore = create<AssistPanelState>()(
  persist(
    set => ({
      isOpen: false,
      widths: {},
      setOpen: open => set({ isOpen: open }),
      toggle: () => set(state => ({ isOpen: !state.isOpen })),
      setWidth: (pageKey, width) =>
        set(state => ({ widths: { ...state.widths, [pageKey]: Math.max(MIN_ASSIST_WIDTH, Math.round(width)) } })),
      resetWidth: pageKey =>
        set(state => ({ widths: Object.fromEntries(Object.entries(state.widths).filter(([key]) => key !== pageKey)) })),
    }),
    {
      name: 'assist-panel',
      // Version 0 saved `mode` and `dockedWidth` for the floating / docked panel. Neither exists now.
      version: 1,
      migrate: () => ({ widths: {} }),
      partialize: state => ({ widths: state.widths }),
    }
  )
);
