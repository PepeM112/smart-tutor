import { create } from 'zustand';

import type { GeneratedQuestionPreview } from '@/client';

interface GenerationState {
  questions: GeneratedQuestionPreview[];
  sourceNoteId: string;
  sourceNoteTitle: string;
  setResult: (questions: GeneratedQuestionPreview[], sourceNoteId: string, sourceNoteTitle: string) => void;
  clear: () => void;
}

export const useGenerationStore = create<GenerationState>()(set => ({
  questions: [],
  sourceNoteId: '',
  sourceNoteTitle: '',

  setResult: (questions, sourceNoteId, sourceNoteTitle) => set({ questions, sourceNoteId, sourceNoteTitle }),

  clear: () => set({ questions: [], sourceNoteId: '', sourceNoteTitle: '' }),
}));
