import { create } from 'zustand';

import type { GeneratedQuestionPreviewInput } from '@/client';

// Bridges AI-generated questions from the generate dialog to the preview page (separate route); cleared once the test is created
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
