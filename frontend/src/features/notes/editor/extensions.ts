// Note editor extension factory.
// Returns the Tiptap extension list for the rich note editor.

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { createLowlight, all as lowlightAllLangs } from 'lowlight';

import { NoteColorMark } from './noteColor';
import { SlashMenuExtension } from './SlashMenu';

import type { AnyExtension } from '@tiptap/core';

const lowlight = createLowlight(lowlightAllLangs);

export type NoteExtensionOptions = {
  /** Placeholder shown when the editor is empty. */
  placeholder?: string;
  /** Translated labels for slash menu items, keyed by labelKey. */
  slashLabels?: Record<string, string>;
};

export function createNoteExtensions(options: NoteExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
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

    // Syntax-highlighted code blocks.
    CodeBlockLowlight.configure({ lowlight }),

    Placeholder.configure({
      placeholder: options.placeholder ?? "Type '/' for commands",
    }),

    SlashMenuExtension.configure({
      translations: options.slashLabels ?? {},
    }),
  ];
}
