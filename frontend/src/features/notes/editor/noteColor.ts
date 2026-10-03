// Text + background color mark for the note editor.
//
// GFM has no color syntax, so the mark is stored as inline HTML:
//   <span data-color="blue">text</span>
//   <span data-bg="yellow">text</span>
//   <span data-color="red" data-bg="gray">text</span>
// The values are semantic names, not hex. `note-editor.css` maps each name to a
// theme-aware CSS variable, so the same note reads well in light and dark themes.

import { Mark, mergeAttributes, type ChainedCommands, type Editor } from '@tiptap/core';

export const NOTE_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

type NoteColorAttrs = { color: NoteColor | null; bg: NoteColor | null };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteColor: {
      /** Set the text color (`null` = default). Keeps the background. */
      setTextColor: (color: NoteColor | null) => ReturnType;
      /** Set the background color (`null` = none). Keeps the text color. */
      setBackgroundColor: (bg: NoteColor | null) => ReturnType;
    };
  }
}

export const isNoteColor = (value: string | null): value is NoteColor =>
  value !== null && (NOTE_COLORS as readonly string[]).includes(value);

export const NoteColorMark = Mark.create({
  name: 'noteColor',

  // Low priority = innermost mark. The serializer then writes `**<span …>x</span>**`.
  // The other order (`<span …>**x**</span>`) is parsed as raw HTML, and the `**` would stay literal.
  priority: 10,

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: el => {
          const value = el.getAttribute('data-color');
          return isNoteColor(value) ? value : null;
        },
        renderHTML: (attrs: NoteColorAttrs) => (attrs.color ? { 'data-color': attrs.color } : {}),
      },
      bg: {
        default: null,
        parseHTML: el => {
          const value = el.getAttribute('data-bg');
          return isNoteColor(value) ? value : null;
        },
        renderHTML: (attrs: NoteColorAttrs) => (attrs.bg ? { 'data-bg': attrs.bg } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-color]' }, { tag: 'span[data-bg]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  renderMarkdown: (node, h) => {
    const { color, bg } = (node.attrs ?? {}) as NoteColorAttrs;
    const attrs = [color && `data-color="${color}"`, bg && `data-bg="${bg}"`].filter(Boolean).join(' ');
    return `<span ${attrs}>${h.renderChildren(node)}</span>`;
  },

  addCommands() {
    // Update one attribute and keep the other. Remove the mark when both are empty.
    const apply =
      (key: keyof NoteColorAttrs, value: NoteColor | null) =>
      ({ editor, chain }: { editor: Editor; chain: () => ChainedCommands }) => {
        const current = editor.getAttributes(this.name) as Partial<NoteColorAttrs>;
        const next: NoteColorAttrs = { color: current.color ?? null, bg: current.bg ?? null, [key]: value };
        if (!next.color && !next.bg) return chain().unsetMark(this.name).run();
        return chain().setMark(this.name, next).run();
      };

    return {
      setTextColor: color => apply('color', color),
      setBackgroundColor: bg => apply('bg', bg),
    };
  },
});
