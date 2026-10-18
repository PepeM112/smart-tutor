import { useEffect } from 'react';
import { create } from 'zustand';

type AssistHiddenState = {
  /** How many pages ask to hide the Assistant. It is hidden while this is above 0. */
  hiders: number;
  hide: () => void;
  show: () => void;
};

/** Not persisted: a reload shows the Assistant again, and the page that hides it asks again. */
export const useAssistHiddenStore = create<AssistHiddenState>()(set => ({
  hiders: 0,
  hide: () => set(state => ({ hiders: state.hiders + 1 })),
  show: () => set(state => ({ hiders: Math.max(0, state.hiders - 1) })),
}));

/** True while a page hides the Assistant panel and its launcher. */
export function useIsAssistHidden(): boolean {
  return useAssistHiddenStore(s => s.hiders > 0);
}

/**
 * Hides the Assistant panel and the launcher while `isHidden` is true (for example, during a timed
 * attempt, where the Assistant must not help and its navigation must not leave the page).
 */
export function useHideAssist(isHidden: boolean): void {
  const hide = useAssistHiddenStore(s => s.hide);
  const show = useAssistHiddenStore(s => s.show);

  useEffect(() => {
    if (!isHidden) return;
    hide();
    return show;
  }, [isHidden, hide, show]);
}
