import { create } from 'zustand';

export type ChatAttachment = {
  id: string;
  type: 'note_chunk' | 'test_questions';
  label: string;
  content: string;
  metadata: {
    noteId?: string;
    testId?: string;
    questionIds?: string[];
    // note_chunk only — needed to reapply an edit after the live text selection is gone
    plainText?: string;
    markdownStart?: number;
    markdownEnd?: number;
  };
};

export type AssistCommand = '/edit-note' | '/edit-test';

type LocalMessageFn = (text: string) => void;

type AssistAttachmentsState = {
  attachments: ChatAttachment[];
  activeCommand: AssistCommand | null;
  addAttachment: (attachment: Omit<ChatAttachment, 'id'>) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  setActiveCommand: (command: AssistCommand | null) => void;
  // Registered by useAssist so AssistInput can add a display-only user message
  // to the chat without triggering the AI stream.
  addLocalMessage: LocalMessageFn | null;
  setAddLocalMessage: (fn: LocalMessageFn | null) => void;
};

// Separate store (not part of useAssist) so note/test editors — which live
// outside the AssistProvider tree — can attach content without needing chat context.
export const useAssistAttachmentsStore = create<AssistAttachmentsState>()(set => ({
  attachments: [],
  activeCommand: null,
  addAttachment: attachment =>
    set(state => ({
      attachments: [...state.attachments, { ...attachment, id: crypto.randomUUID() }],
    })),
  removeAttachment: id => set(state => ({ attachments: state.attachments.filter(a => a.id !== id) })),
  clearAttachments: () => set({ attachments: [] }),
  setActiveCommand: command => set({ activeCommand: command }),
  addLocalMessage: null,
  setAddLocalMessage: fn => set({ addLocalMessage: fn }),
}));
