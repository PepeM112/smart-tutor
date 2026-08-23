'use client';

import { ArrowUp, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';

import {
  useAssistAttachmentsStore,
  type AssistCommand,
  type ChatAttachment,
} from '../store/use-assist-attachments-store';
import { useAssistCommandBridgeStore } from '../store/use-assist-command-bridge';

import { ChipNode } from '../extensions/chip-node';
import { CommandNode } from '../extensions/command-node';

/* ─── helpers (unchanged) ─── */

type SlashCommand = {
  name: string;
  description: string;
};

const COMMANDS: SlashCommand[] = [{ name: '/clear', description: 'Clear the conversation' }];

const ATTACHMENT_HEADINGS: Record<ChatAttachment['type'], string> = {
  note_chunk: '[Selected text from note]',
  test_questions: '[Selected questions from test]',
};

function buildMessageWithAttachments(attachments: ChatAttachment[], text: string): string {
  if (attachments.length === 0) return text;
  const blocks = attachments.map(a => `${ATTACHMENT_HEADINGS[a.type]}\n---\n${a.content}\n---`);
  return `${blocks.join('\n\n')}\n\n${text}`;
}

function buildEditTestMessage(attachments: ChatAttachment[], instructions: string): string {
  const testId = attachments.find(a => a.type === 'test_questions')?.metadata.testId;
  const blocks = attachments
    .filter(a => a.type === 'test_questions')
    .map(a => `${a.content}`)
    .join('\n\n');
  return (
    `Use the refine_questions tool to edit the following question(s) in test ${testId ?? '(unknown)'}. ` +
    `Call get_test_details first to find their exact qid values by matching the prompts below, then apply ` +
    `these instructions to only those questions:\n\n${blocks}\n\nInstructions: ${instructions}`
  );
}

function buildDisplayText(
  command: AssistCommand,
  attachments: ChatAttachment[],
  instructions: string,
): string {
  const chipLabels = attachments.map(a => `[${a.label}]`).join(' ');
  return `${command} ${chipLabels} ${instructions}`.trim();
}

const COMMAND_PLACEHOLDERS: Record<AssistCommand, string> = {
  '/edit-note': 'Describe how the selected text should change...',
  '/edit-test': 'Describe how the selected question(s) should change...',
};

/* ─── component ─── */

type AssistInputProps = {
  onSend: (text: string, displayText?: string) => void;
  onCommand: (command: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
};

export function AssistInput({ onSend, onCommand, onStop, isStreaming }: AssistInputProps) {
  const [draft, setDraft] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const syncingRef = useRef(false);

  const attachments = useAssistAttachmentsStore(s => s.attachments);
  const clearAttachments = useAssistAttachmentsStore(s => s.clearAttachments);
  const activeCommand = useAssistAttachmentsStore(s => s.activeCommand);
  const setActiveCommand = useAssistAttachmentsStore(s => s.setActiveCommand);
  // Refs so Tiptap callbacks always see current values
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const handleSendRef = useRef<() => void>(() => {});
  const resetInputRef = useRef<() => void>(() => {});

  const placeholder = activeCommand
    ? COMMAND_PLACEHOLDERS[activeCommand]
    : 'Ask anything... (/ for commands)';
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;

  /* ─── Tiptap editor ─── */

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
      }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
      }),
      ChipNode,
      CommandNode,
    ],
    editorProps: {
      attributes: {
        class: 'assist-editor outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey && !('isComposing' in event && event.isComposing)) {
          event.preventDefault();
          handleSendRef.current();
          return true;
        }
        if (event.key === 'Escape') {
          resetInputRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const text = ed.getText();
      setDraft(text);
      setDismissed(false);
    },
    onTransaction: ({ transaction, editor: ed }) => {
      if (syncingRef.current || !transaction.docChanged) return;

      let hasCmd = false;
      const chipIds = new Set<string>();
      ed.state.doc.descendants(node => {
        if (node.type.name === 'assistCommand') hasCmd = true;
        if (node.type.name === 'assistChip') chipIds.add(node.attrs.id as string);
      });

      const store = useAssistAttachmentsStore.getState();
      if (!hasCmd && store.activeCommand) store.setActiveCommand(null);
      store.attachments.forEach(a => {
        if (!chipIds.has(a.id)) store.removeAttachment(a.id);
      });
    },
  });

  /* ─── slash-command menu ─── */

  const query = draft.startsWith('/') ? draft.slice(1).toLowerCase() : '';
  const filteredCommands =
    !activeCommand && draft.startsWith('/')
      ? COMMANDS.filter(c => c.name.slice(1).startsWith(query))
      : [];
  const commandMenuOpen =
    !dismissed && !activeCommand && draft.startsWith('/') && filteredCommands.length > 0;
  const clampedIndex = Math.min(activeIndex, Math.max(0, filteredCommands.length - 1));

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !isStreaming;

  const executeCommand = useCallback(
    (cmd: SlashCommand) => {
      onCommand(cmd.name);
      editor?.commands.clearContent();
      setDraft('');
      setDismissed(false);
    },
    [onCommand, editor],
  );

  const resetInput = useCallback(() => {
    syncingRef.current = true;
    editor?.commands.clearContent();
    syncingRef.current = false;
    clearAttachments();
    setActiveCommand(null);
    setDraft('');
  }, [editor, clearAttachments, setActiveCommand]);

  resetInputRef.current = resetInput;

  const handleSend = useCallback(() => {
    const currentDraft = draftRef.current;
    const currentCanSend =
      (currentDraft.trim().length > 0 ||
        useAssistAttachmentsStore.getState().attachments.length > 0) &&
      !isStreaming;
    if (!currentCanSend) return;

    const instructions = currentDraft.trim();
    const store = useAssistAttachmentsStore.getState();
    const cmd = store.activeCommand;
    const atts = store.attachments;

    if (cmd === '/edit-note') {
      const chip = atts.find(a => a.type === 'note_chunk');
      const noteEdit = useAssistCommandBridgeStore.getState().runNoteEdit;
      if (chip && noteEdit) {
        store.addLocalMessage?.(buildDisplayText(cmd, atts, instructions));
        noteEdit({
          markdown: chip.content,
          plainText: chip.metadata.plainText ?? chip.label,
          markdownStart: chip.metadata.markdownStart ?? 0,
          markdownEnd: chip.metadata.markdownEnd ?? 0,
          instructions,
        });
      }
      resetInput();
      return;
    }

    if (cmd === '/edit-test') {
      const display = buildDisplayText(cmd, atts, instructions);
      onSend(buildEditTestMessage(atts, instructions), display);
      resetInput();
      return;
    }

    onSend(buildMessageWithAttachments(atts, instructions));
    resetInput();
  }, [isStreaming, onSend, resetInput]);

  handleSendRef.current = handleSend;

  /* ─── sync command + attachments → editor (single effect to preserve order) ─── */

  useEffect(() => {
    if (!editor) return;

    queueMicrotask(() => {
      if (syncingRef.current) return;
      syncingRef.current = true;

      let hasCmd = false;
      let cmdPos = -1;
      let cmdSize = 0;
      const editorChipIds = new Set<string>();

      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'assistCommand') {
          hasCmd = true;
          cmdPos = pos;
          cmdSize = node.nodeSize;
        }
        if (node.type.name === 'assistChip') editorChipIds.add(node.attrs.id as string);
      });

      let chain = editor.chain();
      let changed = false;

      if (activeCommand && !hasCmd) {
        chain = chain.insertContentAt(1, {
          type: 'assistCommand',
          attrs: { command: activeCommand },
        });
        changed = true;
      } else if (!activeCommand && hasCmd && cmdPos >= 0) {
        chain = chain.deleteRange({ from: cmdPos, to: cmdPos + cmdSize });
        changed = true;
      }

      const newAtts = attachments.filter(a => !editorChipIds.has(a.id));
      if (newAtts.length > 0) {
        // Recalculate insert position from current doc state after command changes
        let insertPos = 1;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'assistCommand' || node.type.name === 'assistChip') {
            insertPos = pos + node.nodeSize;
          }
        });
        // If we just inserted a command, offset for its size (1 node = 1 in ProseMirror)
        if (activeCommand && !hasCmd) insertPos += 1;

        const content = newAtts.map(a => ({
          type: 'assistChip' as const,
          attrs: {
            id: a.id,
            label: a.label,
            content: a.content,
            type: a.type,
            metadata: JSON.stringify(a.metadata),
          },
        }));
        chain = chain.insertContentAt(insertPos, content);
        changed = true;
      }

      if (changed) chain.focus('end').run();
      syncingRef.current = false;
    });
  }, [editor, activeCommand, attachments]);

  /* ─── keyboard: slash menu navigation ─── */

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if (!commandMenuOpen || filteredCommands.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i =>
        e.key === 'ArrowDown'
          ? (i + 1) % filteredCommands.length
          : (i - 1 + filteredCommands.length) % filteredCommands.length,
      );
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      executeCommand(filteredCommands[clampedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDismissed(true);
      editor?.commands.clearContent();
      setDraft('');
    }
  };

  return (
    <div className="relative mt-auto shrink-0 p-2">
      {commandMenuOpen && (
        <div className="absolute inset-x-1.5 bottom-full mb-1 rounded-lg border border-border bg-background p-1 shadow-md">
          {filteredCommands.map((cmd, i) => (
            <button
              key={cmd.name}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => executeCommand(cmd)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-75 ${
                i === clampedIndex ? 'bg-muted' : ''
              }`}
            >
              <span className="text-[12px] font-medium text-foreground">{cmd.name}</span>
              <span className="text-[11px] text-muted-foreground">{cmd.description}</span>
            </button>
          ))}
          <div className="mt-0.5 border-t border-border px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground">
            Type to filter commands
          </div>
        </div>
      )}

      <div
        role="presentation"
        onClick={() => editor?.commands.focus()}
        className="cursor-text rounded-xl border border-border bg-muted/30 px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
      >
        <div className="flex items-end gap-1">
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="min-w-0 flex-1 overflow-y-auto text-[13px] leading-[1.8]"
            style={{ maxHeight: 120 }}
            onKeyDown={handleEditorKeyDown}
          >
            <EditorContent editor={editor} />
          </div>

          <button
            type="button"
            aria-label={isStreaming ? 'Stop' : 'Send'}
            disabled={!canSend && !isStreaming}
            onClick={isStreaming ? onStop : handleSend}
            className="mb-px flex size-7 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-200 enabled:active:scale-95"
            style={{
              background: canSend || isStreaming ? 'var(--primary)' : 'var(--muted)',
              color: canSend || isStreaming ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}
          >
            {isStreaming ? <Square className="size-3" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
