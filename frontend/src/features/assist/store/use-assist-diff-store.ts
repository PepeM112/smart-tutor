import { create } from 'zustand';

import type { GeneratedQuestionPreviewOutput } from '@/client';

type NoteDiff = {
  noteId: string;
  oldContent: string;
  newContent: string;
};

type TestDiff = {
  testId: string;
  questions: GeneratedQuestionPreviewOutput[];
};

type AssistDiffState = {
  pendingNoteDiff: NoteDiff | null;
  setPendingNoteDiff: (diff: NoteDiff) => void;
  clearPendingNoteDiff: () => void;
  pendingTestDiff: TestDiff | null;
  setPendingTestDiff: (diff: TestDiff) => void;
  clearPendingTestDiff: () => void;
};

export const useAssistDiffStore = create<AssistDiffState>(set => ({
  pendingNoteDiff: null,
  setPendingNoteDiff: (diff: NoteDiff) => set({ pendingNoteDiff: diff }),
  clearPendingNoteDiff: () => set({ pendingNoteDiff: null }),
  pendingTestDiff: null,
  setPendingTestDiff: (diff: TestDiff) => set({ pendingTestDiff: diff }),
  clearPendingTestDiff: () => set({ pendingTestDiff: null }),
}));
