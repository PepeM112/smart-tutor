'use client';

// Rich WYSIWYG note editor built on Tiptap v3.
// Single always-editable component — no Edit/View toggle.
// `editable={false}` gives a read-only renderer for DiffNoteContent.
// `editorRef` (React 19 ref-as-prop) exposes `setMarkdown` and the raw editor
// so the host page can update content without remounting.

import { EditorContent, useEditor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

import { createNoteExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown } from './markdown';
import { NoteBubbleMenu, type SelectionContext } from './NoteBubbleMenu';
import './note-editor.css';

import type { Editor } from '@tiptap/core';

// ─── public types ─────────────────────────────────────────────────────────────

export type RichNoteEditorRef = {
  /** Replace the full document with `markdown` without remounting. */
  setMarkdown: (markdown: string) => void;
  /** Raw Tiptap editor (null during SSR/initial hydration). */
  editor: Editor | null;
};

export type RichNoteEditorProps = {
  /** Initial GFM markdown. Parsed on mount — changes after mount go through `editorRef.setMarkdown`. */
  initialContent: string;
  /** Called with serialized GFM markdown on every document change (not selection changes). */
  onChange?: (markdown: string) => void;
  /** Defaults to `true`. Set `false` for read-only diff rendering. */
  editable?: boolean;
  onBlur?: () => void;
  /** Renders "Ask AI" button in bubble menu when provided. */
  onAskAi?: (selection: SelectionContext) => void;
  /** Renders "Send to Assistant" button in bubble menu when provided. */
  onSendToAssistant?: (selection: SelectionContext) => void;
  /** React 19 ref prop — exposes `setMarkdown` and `editor`. */
  editorRef?: React.Ref<RichNoteEditorRef>;
  className?: string;
};

// ─── component ────────────────────────────────────────────────────────────────

// Module constant: a new object on each render also counts as changed options.
const EDITOR_PROPS = {
  attributes: {
    class: 'note-editor-content outline-none min-h-[120px]',
  },
};

export function RichNoteEditor({
  initialContent,
  onChange,
  editable = true,
  onBlur,
  onAskAi,
  onSendToAssistant,
  editorRef,
  className,
}: RichNoteEditorProps) {
  const t = useTranslations('notes');

  // Cache the latest onChange so the editor callback never stale-closes.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Memoized: `useEditor` compares extensions by identity, so a new list on each render
  // made it call `setOptions` on every render (and every keystroke re-renders the page).
  const extensions = useMemo(
    () =>
      createNoteExtensions({
        placeholder: t('slash_menu_placeholder'),
        slashHint: t('slash_menu_hint'),
        slashLabels: {
          slash_text: t('slash_text'),
          slash_h1: t('slash_h1'),
          slash_h2: t('slash_h2'),
          slash_h3: t('slash_h3'),
          slash_bullet: t('slash_bullet'),
          slash_ordered: t('slash_ordered'),
          slash_todo: t('slash_todo'),
          slash_quote: t('slash_quote'),
          slash_code: t('slash_code'),
          slash_divider: t('slash_divider'),
          slash_table: t('slash_table'),
        },
      }),
    [t]
  );

  const editor = useEditor({
    extensions,
    // Next renders on the server first; the editor is created on the client only.
    immediatelyRender: false,

    // Start empty; onCreate parses the initial markdown after extensions are ready.
    content: '',
    editable,

    editorProps: EDITOR_PROPS,

    onCreate: ({ editor: ed }) => {
      if (!initialContent) return;
      const json = parseMarkdown(ed, initialContent);
      // emitUpdate: false prevents a spurious onChange during the initial load.
      // addToHistory: false — otherwise the first Cmd+Z undoes the load and empties the note.
      ed.chain().setMeta('addToHistory', false).setContent(json, { emitUpdate: false }).run();
    },

    onUpdate: ({ editor: ed }) => {
      onChangeRef.current?.(serializeMarkdown(ed));
    },

    onBlur: () => {
      onBlur?.();
    },
  });

  // Sync `editable` changes without remounting.
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useImperativeHandle(
    editorRef,
    () => ({
      setMarkdown: (markdown: string) => {
        if (!editor) return;
        const json = parseMarkdown(editor, markdown);
        // emitUpdate: false — the caller owns the change; we echo it back once manually.
        editor.commands.setContent(json, { emitUpdate: false });
        onChangeRef.current?.(markdown);
      },
      editor: editor ?? null,
    }),
    [editor]
  );

  return (
    <div data-slot="rich-note-editor" className={cn('relative', className)}>
      <EditorContent editor={editor} />
      {editor && editable && <NoteBubbleMenu editor={editor} onAskAi={onAskAi} onSendToAssistant={onSendToAssistant} />}
    </div>
  );
}
