// Toggle block (collapsible section): a one-line summary and block content below it.
// Saved as HTML `<details>`, with blank lines around the inner Markdown so it renders on GitHub:
//
//   <details>
//   <summary>Title</summary>
//
//   Markdown content.
//
//   </details>
//
// The parser also accepts `<details>` without the blank lines. Open or closed is view-only
// (state of the NodeView), so it is never stored. No React here: the NodeView is in `extensions.ts`.

import { mergeAttributes, Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

import type { JSONContent, MarkdownToken } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggle: {
      /** Insert an empty toggle at the selection. */
      insertToggle: () => ReturnType;
    };
  }
}

const OPEN_TAG_RE = /^[ \t]{0,3}<details\b[^>]*>[ \t]*\n?/i;
const SUMMARY_RE = /^[ \t]*<summary\b[^>]*>([\s\S]*?)<\/summary>[ \t]*\n?/i;
const TAG_RE = /<details\b[^>]*>|<\/details>/gi;

type DetailsSplit = { raw: string; summary: string; body: string };

/**
 * Find the end of the `<details>` block that starts at the beginning of `src`.
 * It counts the opening and closing tags, so a toggle inside a toggle works.
 */
const findDetailsEnd = (src: string): number | null => {
  const final = [...src.matchAll(TAG_RE)].reduce<{ depth: number; end: number | null }>(
    (state, tag) => {
      if (state.end !== null) return state;
      const depth = tag[0].startsWith('</') ? state.depth - 1 : state.depth + 1;
      return depth === 0 ? { depth, end: tag.index + tag[0].length } : { depth, end: null };
    },
    { depth: 0, end: null }
  );
  return final.end;
};

const splitDetails = (src: string): DetailsSplit | null => {
  const open = OPEN_TAG_RE.exec(src);
  if (!open) return null;
  const end = findDetailsEnd(src);
  if (end === null) return null;

  // The closing tag must end its line (or the text): `</details> more` is not a toggle block.
  const rest = /^[ \t]*(?:\n|$)/.exec(src.slice(end));
  if (!rest) return null;

  const inner = src.slice(open[0].length, end - '</details>'.length);
  const summary = SUMMARY_RE.exec(inner);
  return {
    raw: src.slice(0, end + rest[0].length),
    summary: summary?.[1]?.trim() ?? '',
    body: summary ? inner.slice(summary[0].length) : inner,
  };
};

/** The summary is one line of text: join the lines. */
const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, ' ');

export const NoteToggleSummary = Node.create({
  name: 'toggleSummary',
  // No `group`: a summary only lives inside a toggle.
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-toggle-summary]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-toggle-summary': '' }), 0];
  },

  addKeyboardShortcuts() {
    return {
      // Enter in the title moves into the content: a split would make a second title.
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== this.name) return false;
        // `near` finds the first text position after the summary. The first block of the content can be a
        // list, a table or a callout, so "after + 1" is not always a text position.
        return editor
          .chain()
          .command(({ tr }) => {
            tr.setSelection(TextSelection.near(tr.doc.resolve($from.after())));
            return true;
          })
          .run();
      },
    };
  },
});

export const NoteToggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-toggle]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-toggle': '' }), 0];
  },

  markdownTokenName: 'toggle',

  markdownTokenizer: {
    name: 'toggle',
    level: 'block',
    start: (src: string) => src.search(/^[ \t]{0,3}<details\b/im),
    tokenize: (src, _tokens, lexer) => {
      const split = splitDetails(src);
      if (!split) return undefined;
      return {
        type: 'toggle',
        raw: split.raw,
        summaryTokens: lexer.inlineTokens(oneLine(split.summary)),
        tokens: lexer.blockTokens(split.body.trim()),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const summaryTokens = (token.summaryTokens ?? []) as MarkdownToken[];
    const children = helpers.parseChildren(token.tokens ?? []);
    const summary: JSONContent = helpers.createNode('toggleSummary', undefined, helpers.parseInline(summaryTokens));
    // The schema needs at least one block after the summary.
    return helpers.createNode('toggle', undefined, [
      summary,
      ...(children.length > 0 ? children : [{ type: 'paragraph' }]),
    ]);
  },

  renderMarkdown: (node, h) => {
    const [summary, ...blocks] = node.content ?? [];
    const title = oneLine(h.renderChildren(summary?.content ?? []));
    const body = h.renderChildren(blocks, '\n\n').trim();
    return ['<details>', `<summary>${title}</summary>`, '', ...(body ? [body, ''] : []), '</details>'].join('\n');
  },

  addCommands() {
    return {
      insertToggle:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'toggleSummary' }, { type: 'paragraph' }],
          }),
    };
  },
});
