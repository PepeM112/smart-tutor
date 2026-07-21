import { create } from 'zustand';

import type { GeneratedQuestionPreviewInput } from '@/client';

interface GenerationState {
  questions: GeneratedQuestionPreviewInput[];
  sourceNoteId: string;
  sourceNoteTitle: string;
  setResult: (
    questions: GeneratedQuestionPreviewInput[],
    sourceNoteId?: string | null,
    sourceNoteTitle?: string | null
  ) => void;
  clear: () => void;
}

export const useGenerationStore = create<GenerationState>()(set => ({
  questions: [],
  sourceNoteId: '',
  sourceNoteTitle: '',

  setResult: (questions, sourceNoteId, sourceNoteTitle) =>
    set({ questions, sourceNoteId: sourceNoteId ?? '', sourceNoteTitle: sourceNoteTitle ?? '' }),

  clear: () => set({ questions: [], sourceNoteId: '', sourceNoteTitle: '' }),
}));
