'use client';

import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ArrowUp, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePageData, type MentionCandidate } from '../context/PageDataContext';
import { ChipNode } from '../extensions/chipNode';
import { CommandNode } from '../extensions/commandNode';
import { MentionNode } from '../extensions/mentionNode';
import {
  useAssistAttachmentsStore,
  type AssistCommand,
  type ChatAttachment,
} from '../store/useAssistAttachmentsStore';
import { useAssistCommandBridgeStore } from '../store/useAssistCommandBridge';

import type { Node as PmNode } from '@tiptap/pm/model';

/* ─── constants ─── */

type SlashCommand = {
  name: string;
  description: string;
};

const COMMANDS: SlashCommand[] = [{ name: '/clear', description: 'Clear the conversation' }];

const ATTACHMENT_HEADINGS: Record<ChatAttachment['type'], string> = {
  note_chunk: '[Selected text from note]',
  test_questions: '[Selected questions from test]',
};

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
  const hasSyncedRef = useRef(false);

  const attachments = useAssistAttachmentsStore(s => s.attachments);
  const clearAttachments = useAssistAttachmentsStore(s => s.clearAttachments);
  const activeCommand = useAssistAttachmentsStore(s => s.activeCommand);
  const setActiveCommand = useAssistAttachmentsStore(s => s.setActiveCommand);

  const { mentionCandidates } = usePageData();

  // Refs so Tiptap callbacks (which capture once) always see current values
  const draftRef = useRef(draft);
  const handleSendRef = useRef<() => void>(() => {});
  const resetInputRef = useRef<() => void>(() => {});
  const placeholderRef = useRef('Ask anything... (/ for commands)');
  const mentionMenuOpenRef = useRef(false);
  const insertMentionFromMenuRef = useRef<() => void>(() => {});

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    placeholderRef.current = activeCommand ? COMMAND_PLACEHOLDERS[activeCommand] : 'Ask anything... (/ for commands)';
  }, [activeCommand]);

  /* ─── mention state ─── */

  const [mentionTrigger, setMentionTrigger] = useState<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionCandidatesRef = useRef(mentionCandidates);

  useEffect(() => {
    mentionCandidatesRef.current = mentionCandidates;
  }, [mentionCandidates]);

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
      // eslint-disable-next-line react-hooks/refs -- Tiptap reads this lazily during ProseMirror render, not React render
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      ChipNode,
      CommandNode,
      MentionNode,
    ],
    editorProps: {
      attributes: {
        class: 'assist-editor outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey && !('isComposing' in event && event.isComposing)) {
          event.preventDefault();
          event.stopPropagation();
          if (mentionMenuOpenRef.current) {
            insertMentionFromMenuRef.current();
          } else {
            handleSendRef.current();
          }
          return true;
        }
        if (event.key === 'Escape') {
          event.stopPropagation();
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

      if (mentionCandidatesRef.current.length > 0) {
        const trigger = detectMentionTrigger(ed);
        setMentionTrigger(trigger);
      } else {
        setMentionTrigger(null);
      }
    },
    onTransaction: ({ transaction, editor: ed }) => {
      if (syncingRef.current || !hasSyncedRef.current || !transaction.docChanged) return;

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
    onSelectionUpdate: ({ editor: ed }) => {
      if (mentionCandidatesRef.current.length > 0) {
        const trigger = detectMentionTrigger(ed);
        setMentionTrigger(trigger);
      }
    },
  });

  /* ─── mention filtering + insertion (depends on editor) ─── */

  const filteredMentions = useMemo(
    () =>
      mentionTrigger && mentionCandidates.length > 0
        ? mentionCandidates.filter(
            c =>
              c.label.toLowerCase().includes(mentionTrigger.query) ||
              c.preview.toLowerCase().includes(mentionTrigger.query)
          )
        : [],
    [mentionTrigger, mentionCandidates]
  );

  const mentionMenuOpen = filteredMentions.length > 0 && !!mentionTrigger;
  const clampedMentionIndex = Math.min(mentionIndex, Math.max(0, filteredMentions.length - 1));

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionTrigger?.query]);

  const insertMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!editor || !mentionTrigger) return;
      editor
        .chain()
        .deleteRange({ from: mentionTrigger.from, to: mentionTrigger.to })
        .insertContentAt(mentionTrigger.from, {
          type: 'assistMention',
          attrs: { id: candidate.id, label: candidate.label, content: candidate.content },
        })
        .focus()
        .run();
      setMentionTrigger(null);
    },
    [editor, mentionTrigger]
  );

  useEffect(() => {
    mentionMenuOpenRef.current = mentionMenuOpen;
  }, [mentionMenuOpen]);

  useEffect(() => {
    insertMentionFromMenuRef.current = () => {
      if (filteredMentions.length > 0) {
        insertMention(filteredMentions[clampedMentionIndex]);
      }
    };
  }, [filteredMentions, clampedMentionIndex, insertMention]);

  /* ─── slash-command menu ─── */

  const query = draft.startsWith('/') ? draft.slice(1).toLowerCase() : '';
  const filteredCommands =
    !activeCommand && draft.startsWith('/') ? COMMANDS.filter(c => c.name.slice(1).startsWith(query)) : [];

  useEffect(() => {
    setActiveIndex(0);
  }, [filteredCommands.length]);

  const commandMenuOpen = !dismissed && !activeCommand && draft.startsWith('/') && filteredCommands.length > 0;
  const clampedIndex = Math.min(activeIndex, Math.max(0, filteredCommands.length - 1));

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !isStreaming;

  const executeCommand = useCallback(
    (cmd: SlashCommand) => {
      onCommand(cmd.name);
      editor?.commands.clearContent();
      setDraft('');
      setDismissed(false);
    },
    [onCommand, editor]
  );

  const resetInput = useCallback(() => {
    syncingRef.current = true;
    editor?.commands.clearContent();
    syncingRef.current = false;
    hasSyncedRef.current = false;
    clearAttachments();
    setActiveCommand(null);
    setDraft('');
    setMentionTrigger(null);
  }, [editor, clearAttachments, setActiveCommand]);

  useEffect(() => {
    resetInputRef.current = resetInput;
  }, [resetInput]);

  const handleSend = useCallback(() => {
    const currentDraft = draftRef.current;
    const currentCanSend =
      (currentDraft.trim().length > 0 || useAssistAttachmentsStore.getState().attachments.length > 0) && !isStreaming;
    if (!currentCanSend) return;

    const instructions = currentDraft.trim();
    const store = useAssistAttachmentsStore.getState();
    const cmd = store.activeCommand;
    const atts = store.attachments;

    const mentions = editor ? collectMentionContent(editor.state.doc) : [];

    if (cmd === '/edit-note') {
      const chip = atts.find(a => a.type === 'note_chunk');
      const noteEdit = useAssistCommandBridgeStore.getState().noteEditRunner;
      if (chip && noteEdit) {
        const cbs = useAssistAttachmentsStore.getState();
        cbs.addLocalMessage?.(buildDisplayText(cmd, atts, instructions));
        const processingId = cbs.addLocalToolCall?.('refine_note');
        noteEdit({
          markdown: chip.content,
          plainText: chip.metadata.plainText ?? chip.label,
          markdownStart: chip.metadata.markdownStart ?? 0,
          markdownEnd: chip.metadata.markdownEnd ?? 0,
          instructions,
          onSettled: () => {
            if (processingId) useAssistAttachmentsStore.getState().updateToolCallStatus?.(processingId, 'done');
          },
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

    const messageText = prependMentions(mentions, buildMessageWithAttachments(atts, instructions));
    const displayText = mentions.length > 0 && editor ? buildDisplayFromDoc(editor.state.doc) : undefined;
    onSend(messageText, displayText);
    resetInput();
  }, [isStreaming, onSend, resetInput, editor]);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  /* ─── sync command + attachments → editor (single effect to preserve order) ─── */

  useEffect(() => {
    if (!editor) return;

    // Disable onTransaction clearing until the microtask sync completes
    hasSyncedRef.current = false;

    queueMicrotask(() => {
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
        let insertPos = 1;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'assistCommand' || node.type.name === 'assistChip') {
            insertPos = pos + node.nodeSize;
          }
        });
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
      hasSyncedRef.current = true;
    });
  }, [editor, activeCommand, attachments]);

  /* ─── keyboard: slash menu + mention menu navigation ─── */

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if (mentionMenuOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i =>
          e.key === 'ArrowDown'
            ? (i + 1) % filteredMentions.length
            : (i - 1 + filteredMentions.length) % filteredMentions.length
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentions[clampedMentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionTrigger(null);
        return;
      }
    }

    if (!commandMenuOpen || filteredCommands.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i =>
        e.key === 'ArrowDown'
          ? (i + 1) % filteredCommands.length
          : (i - 1 + filteredCommands.length) % filteredCommands.length
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
      {/* Slash command popover */}
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

      {/* Mention popover */}
      {mentionMenuOpen && (
        <div className="absolute inset-x-1.5 bottom-full mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-md">
          {filteredMentions.map((candidate, i) => (
            <button
              key={candidate.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => insertMention(candidate)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-75 ${
                i === clampedMentionIndex ? 'bg-muted' : ''
              }`}
            >
              <span className="text-[12px] font-medium text-primary">@{candidate.label}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {candidate.preview.length > 60 ? `${candidate.preview.slice(0, 60)}…` : candidate.preview}
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        role="presentation"
        onClick={() => editor?.commands.focus()}
        className="cursor-text rounded-xl border border-border bg-muted/30 px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
      >
        <div className="flex items-end gap-1">
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

/* ─── helpers ─── */

function buildMessageWithAttachments(attachments: ChatAttachment[], text: string): string {
  if (attachments.length === 0) return text;
  const blocks = attachments.map(a => `${ATTACHMENT_HEADINGS[a.type]}\n---\n${a.content}\n---`);
  return `${blocks.join('\n\n')}\n\n${text}`;
}

function buildEditTestMessage(attachments: ChatAttachment[], instructions: string): string {
  const testAttachments = attachments.filter(a => a.type === 'test_questions');
  const testId = testAttachments[0]?.metadata.testId;
  const blocks = testAttachments.map(a => `${a.content}`).join('\n\n');

  const questionIds = testAttachments.flatMap(a => a.metadata.questionIds ?? []);
  const hasAllIds = questionIds.length === testAttachments.length;
  const idInstruction = hasAllIds
    ? `Call the refine_questions tool directly with question_ids: [${questionIds.join(', ')}].`
    : `Call get_test_details first to find their exact qid values by matching the prompts below, then call refine_questions.`;

  return (
    `Use the refine_questions tool to edit the following question(s) in test ${testId ?? '(unknown)'}. ` +
    `${idInstruction} Apply these instructions to only those questions:\n\n${blocks}\n\nInstructions: ${instructions}`
  );
}

function buildDisplayText(command: AssistCommand, attachments: ChatAttachment[], instructions: string): string {
  const chipLabels = attachments.map(a => `[${a.label}]`).join(' ');
  return `${command} ${chipLabels} ${instructions}`.trim();
}

function collectMentionContent(doc: PmNode): string[] {
  const mentions: string[] = [];
  doc.descendants(node => {
    if (node.type.name === 'assistMention') {
      mentions.push(node.attrs.content as string);
    }
  });
  return mentions;
}

function buildDisplayFromDoc(doc: PmNode): string {
  let result = '';
  doc.descendants(node => {
    if (node.isText) {
      result += node.text ?? '';
    } else if (node.type.name === 'assistMention') {
      result += `@${node.attrs.label as string}`;
    } else if (node.type.name === 'assistChip') {
      result += `[${node.attrs.label as string}]`;
    } else if (node.type.name === 'assistCommand') {
      result += node.attrs.command as string;
    }
  });
  return result.trim();
}

function prependMentions(mentionContent: string[], text: string): string {
  if (mentionContent.length === 0) return text;
  const block = `[Referenced questions]\n---\n${mentionContent.join('\n')}\n---`;
  return `${block}\n\n${text}`;
}

/* ─── mention trigger helpers ─── */

type MentionState = {
  query: string;
  from: number;
  to: number;
};

function detectMentionTrigger(ed: ReturnType<typeof useEditor>): MentionState | null {
  if (!ed) return null;
  const { $anchor } = ed.state.selection;
  const textBefore = $anchor.parent.textBetween(0, $anchor.parentOffset, undefined, '￼');
  const atIndex = textBefore.lastIndexOf('@');
  if (atIndex === -1) return null;
  if (atIndex > 0 && /\S/.test(textBefore[atIndex - 1])) return null;

  const query = textBefore.slice(atIndex + 1).toLowerCase();
  const from = $anchor.start() + atIndex;
  const to = $anchor.pos;
  return { query, from, to };
}
