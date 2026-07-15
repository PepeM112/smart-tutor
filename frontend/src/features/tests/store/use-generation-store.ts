import { create } from 'zustand';

import type { GeneratedQuestionPreview } from '@/client';

interface GenerationState {
  questions: GeneratedQuestionPreview[];
  sourceNoteId: string;
  sourceNoteTitle: string;
  hasData: boolean;
  setResult: (questions: GeneratedQuestionPreview[], sourceNoteId: string, sourceNoteTitle: string) => void;
  clear: () => void;
}

export const useGenerationStore = create<GenerationState>()(set => ({
  questions: [],
  sourceNoteId: '',
  sourceNoteTitle: '',
  hasData: false,

  setResult: (questions, sourceNoteId, sourceNoteTitle) =>
    set({ questions, sourceNoteId, sourceNoteTitle, hasData: true }),

  clear: () => set({ questions: [], sourceNoteId: '', sourceNoteTitle: '', hasData: false }),
}));
