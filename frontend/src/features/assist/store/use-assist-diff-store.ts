import { create } from 'zustand';

type NoteDiff = {
  noteId: string;
  oldContent: string;
  newContent: string;
};

type AssistDiffState = {
  pendingNoteDiff: NoteDiff | null;
  setPendingNoteDiff: (diff: NoteDiff) => void;
  clearPendingNoteDiff: () => void;
};

export const useAssistDiffStore = create<AssistDiffState>(set => ({
  pendingNoteDiff: null,
  setPendingNoteDiff: (diff: NoteDiff) => set({ pendingNoteDiff: diff }),
  clearPendingNoteDiff: () => set({ pendingNoteDiff: null }),
}));
