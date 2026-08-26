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
type LocalAssistantMessageFn = (text: string) => string;
type RemoveMessageFn = (id: string) => void;
type LocalToolCallFn = (name: string) => string;
type UpdateToolCallStatusFn = (id: string, status: 'done' | 'failed') => void;

type AssistAttachmentsState = {
  attachments: ChatAttachment[];
  activeCommand: AssistCommand | null;
  addAttachment: (attachment: Omit<ChatAttachment, 'id'>) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  setActiveCommand: (command: AssistCommand | null) => void;

  // Callbacks registered by useAssist so that AssistInput (a sibling subtree)
  // can add local messages without holding a reference to the chat state setter.
  // Read imperatively via getState() — no component subscribes to these fields.
  addLocalMessage: LocalMessageFn | null;
  addLocalAssistantMessage: LocalAssistantMessageFn | null;
  removeMessage: RemoveMessageFn | null;
  addLocalToolCall: LocalToolCallFn | null;
  updateToolCallStatus: UpdateToolCallStatusFn | null;
  setCallbacks: (cbs: {
    addLocalMessage: LocalMessageFn | null;
    addLocalAssistantMessage: LocalAssistantMessageFn | null;
    removeMessage: RemoveMessageFn | null;
    addLocalToolCall: LocalToolCallFn | null;
    updateToolCallStatus: UpdateToolCallStatusFn | null;
  }) => void;
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
  addLocalAssistantMessage: null,
  removeMessage: null,
  addLocalToolCall: null,
  updateToolCallStatus: null,
  setCallbacks: cbs => set(cbs),
}));
