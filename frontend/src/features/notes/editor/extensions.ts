// Note editor extension factory.
// Returns the Tiptap extension list for the rich note editor.

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';

import { CodeBlockView } from './CodeBlockView';
import { NoteColorMark } from './noteColor';
import { DEFAULT_SLASH_HINT, SlashMenuExtension } from './SlashMenu';

import type { AnyExtension } from '@tiptap/core';

// `common` (~37 languages) instead of `all` (~190): `all` adds a large amount to the notes bundle.
const lowlight = createLowlight(common);

export type NoteExtensionOptions = {
  /** Placeholder shown when the editor is empty. */
  placeholder?: string;
  /** Translated labels for slash menu items, keyed by labelKey. */
  slashLabels?: Record<string, string>;
  /** Translated key hint in the slash menu footer. */
  slashHint?: string;
};

export function createNoteExtensions(options: NoteExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      // spellcheck off: the browser marks code words as spelling errors.
      code: { HTMLAttributes: { spellcheck: 'false' } },
      heading: { levels: [1, 2, 3] },
    }),

    // Official @tiptap/markdown — parses GFM on load, serializes on save.
    Markdown,

    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),

    // TableKit bundles Table + TableRow + TableCell + TableHeader.
    TableKit,

    // Text/background color, stored as <span data-color|data-bg> in the markdown.
    NoteColorMark,

    TaskList,
    TaskItem.configure({ nested: false }),

    // Syntax-highlighted code blocks, with a language chip (React NodeView).
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight }),

    Placeholder.configure({
      placeholder: options.placeholder ?? "Type '/' for commands",
    }),

    SlashMenuExtension.configure({
      translations: options.slashLabels ?? {},
      hint: options.slashHint ?? DEFAULT_SLASH_HINT,
    }),
  ];
}
