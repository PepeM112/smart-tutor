import { create } from 'zustand';

export type RunNoteEditParams = {
  markdown: string;
  plainText: string;
  markdownStart: number;
  markdownEnd: number;
  instructions: string;
  onSettled?: () => void;
};

type NoteEditRunner = (params: RunNoteEditParams) => void;

type AssistCommandBridgeState = {
  noteEditRunner: NoteEditRunner | null;
  setNoteEditRunner: (fn: NoteEditRunner | null) => void;
};

// The /edit-note command is handled by AssistInput (a different subtree from the
// mounted note editor), but must run through the note editor's own diff/highlight
// state so the old "highlight edited text -> click -> diff panel" UX still works.
// The note editor registers its handler here whenever a note is mounted.
// Read imperatively via getState() — no component subscribes to this store.
export const useAssistCommandBridgeStore = create<AssistCommandBridgeState>()(set => ({
  noteEditRunner: null,
  setNoteEditRunner: fn => set({ noteEditRunner: fn }),
}));
