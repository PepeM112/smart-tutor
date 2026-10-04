// Callout block: a colored box with an icon and block content (GitHub alert syntax in the Markdown).
//
//   > [!TIP]
//   > Text of the callout.
//
// The marker alone on the first line is required. Other viewers show these as plain quotes,
// so the text is never lost. No React here: the NodeView is added in `extensions.ts`.

import { mergeAttributes, Node } from '@tiptap/core';

import { CALLOUT_TYPES, DEFAULT_CALLOUT_TYPE, toCalloutType, type CalloutType } from './calloutTypes';

import type { JSONContent } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selected blocks in a callout of the given type. */
      setCallout: (type?: CalloutType) => ReturnType;
      /** Change the type of the callout around the selection. */
      updateCalloutType: (type: CalloutType) => ReturnType;
    };
  }
}

const MARKER_NAMES = CALLOUT_TYPES.join('|');

// `> [!TIP]` line, then the lines that start with `>`. Up to 3 spaces of indent, like a quote.
const CALLOUT_RE = new RegExp(`^ {0,3}>[ \\t]?\\[!(${MARKER_NAMES})\\][ \\t]*(?:\\n|$)((?: {0,3}>.*(?:\\n|$))*)`, 'i');

const QUOTE_PREFIX_RE = /^ {0,3}> ?/;

/** Remove the `> ` quote prefix of each line. */
const unquote = (body: string): string =>
  body
    .split('\n')
    .map(line => line.replace(QUOTE_PREFIX_RE, ''))
    .join('\n');

/** Prefix each line with `> `. Empty lines get a bare `>`. */
const quote = (text: string): string =>
  text
    .split('\n')
    .map(line => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');

export const NoteCallout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  // `defining`: lifting or replacing content inside keeps the callout.
  defining: true,

  addAttributes() {
    return {
      type: {
        default: DEFAULT_CALLOUT_TYPE,
        parseHTML: el => toCalloutType(el.getAttribute('data-callout')),
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': toCalloutType(node.attrs.type) }), 0];
  },

  markdownTokenName: 'callout',

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    // Lets the callout interrupt a paragraph (marked uses this to find where a block starts).
    start: (src: string) => src.search(/^ {0,3}>[ \t]?\[!/im),
    tokenize: (src, _tokens, lexer) => {
      const match = CALLOUT_RE.exec(src);
      if (!match) return undefined;
      const [raw, marker = '', body = ''] = match;
      return {
        type: 'callout',
        raw,
        calloutType: marker.toLowerCase(),
        tokens: lexer.blockTokens(unquote(body)),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const children = helpers.parseChildren(token.tokens ?? []);
    // The schema needs at least one block: an empty callout gets an empty paragraph.
    const content: JSONContent[] = children.length > 0 ? children : [{ type: 'paragraph' }];
    return helpers.createNode('callout', { type: toCalloutType(token.calloutType) }, content);
  },

  renderMarkdown: (node, h) => {
    const type = toCalloutType(node.attrs?.type).toUpperCase();
    const blocks = (node.content ?? [])
      .map((child, index) => quote(h.renderChild?.(child, index) ?? h.renderChildren([child])))
      .join('\n>\n');
    return blocks ? `> [!${type}]\n${blocks}` : `> [!${type}]`;
  },

  addCommands() {
    return {
      setCallout:
        (type = DEFAULT_CALLOUT_TYPE) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type }),
      updateCalloutType:
        type =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { type }),
    };
  },
});
