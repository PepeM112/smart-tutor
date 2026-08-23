import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type PanelMode = 'floating' | 'docked';

type AssistPanelState = {
  mode: PanelMode;
  isOpen: boolean;
  dockedWidth: number;
  setMode: (mode: PanelMode) => void;
  setOpen: (open: boolean) => void;
  setDockedWidth: (width: number) => void;
  toggleMode: () => void;
};

const DEFAULT_DOCKED_WIDTH = 380;
const MIN_DOCKED_WIDTH = 300;
const MAX_DOCKED_WIDTH = 600;

export { MIN_DOCKED_WIDTH, MAX_DOCKED_WIDTH };

export const useAssistPanelStore = create<AssistPanelState>()(
  persist(
    set => ({
      mode: 'floating',
      isOpen: false,
      dockedWidth: DEFAULT_DOCKED_WIDTH,
      setMode: mode => set({ mode }),
      setOpen: open => set({ isOpen: open }),
      setDockedWidth: width => set({ dockedWidth: Math.max(MIN_DOCKED_WIDTH, Math.min(MAX_DOCKED_WIDTH, width)) }),
      toggleMode: () =>
        set(state => ({
          mode: state.mode === 'floating' ? 'docked' : 'floating',
        })),
    }),
    {
      name: 'assist-panel',
      partialize: state => ({ mode: state.mode, dockedWidth: state.dockedWidth }),
    }
  )
);
