// Note editor extension factory.
// Returns the Tiptap extension list for the rich note editor.

import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';

import { CalloutView } from './callout/CalloutView';
import { NoteCallout } from './callout/noteCallout';
import { ChunkHighlight } from './chunkHighlight';
import { CodeBlockView } from './CodeBlockView';
import { NoteCodeWrap } from './codeBlockWrap';
import { NoteLink } from './link/noteLink';
import { NoteCodeBlock } from './noteCodeBlock';
import { NoteColorMark } from './noteColor';
import { HeadingAnchors } from './outline/headingAnchors';
import { SlashMenuExtension } from './SlashMenu';
import { createNoteTableExtensions } from './table/noteTable';
import { NoteToggle, NoteToggleSummary } from './toggle/noteToggle';
import { ToggleView } from './toggle/ToggleView';

import type { AnyExtension } from '@tiptap/core';

// `common` (~37 languages) instead of `all` (~190): `all` adds a large amount to the notes bundle.
const lowlight = createLowlight(common);

export type NoteExtensionOptions = {
  /** Placeholder shown when the editor is empty. */
  placeholder?: string;
  /**
   * Give each heading a slug `id` (render only, not saved). Off by default: two editors on one page
   * (the diff panes) would repeat the same ids.
   */
  headingAnchors?: boolean;
};

export function createNoteExtensions(options: NoteExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      // spellcheck off: the browser marks code words as spelling errors.
      code: { HTMLAttributes: { spellcheck: 'false' } },
      heading: { levels: [1, 2, 3] },
      // StarterKit v3 bundles Link; disable it here so the configured Link below is the only one.
      link: false,
    }),

    // Official @tiptap/markdown — parses GFM on load, serializes on save.
    Markdown,

    // Cmd/Ctrl+click opens the link; the popover (`link/LinkPopover.tsx`) edits it.
    NoteLink.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),

    // Table + row + cell + header: resizable, layout, cell colors, saved as HTML (see `table/`).
    ...createNoteTableExtensions(),

    // Text/background color, stored as <span data-color|data-bg> in the markdown.
    NoteColorMark,

    TaskList,
    // nested: Tab / Shift+Tab indent and outdent a to-do. An indented `- [ ]` is saved with 2 spaces per level.
    TaskItem.configure({ nested: true }),

    // Syntax-highlighted code blocks, with a language chip (React NodeView).
    NoteCodeBlock.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight }),
    // "Wrap lines" of a code block (view only, not saved). Not inside `NoteCodeBlock`: see `codeBlockWrap.ts`.
    NoteCodeWrap,

    // Callout (`> [!TIP]`) and toggle (`<details>`): see `callout/` and `toggle/`.
    NoteCallout.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CalloutView);
      },
    }),
    NoteToggleSummary,
    NoteToggle.extend({
      addNodeView() {
        return ReactNodeViewRenderer(ToggleView);
      },
    }),

    Placeholder.configure({
      placeholder: options.placeholder ?? "Type '/' for commands",
    }),

    SlashMenuExtension,

    // Highlight on the text of an AI chunk edit (decoration only, not saved).
    ChunkHighlight,

    // Slug ids on headings for `#slug` links and the outline (decoration only, not saved).
    ...(options.headingAnchors ? [HeadingAnchors] : []),
  ];
}
