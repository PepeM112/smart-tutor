// Typing `$x^2$` makes inline math. Typing `$$x^2$$` at the start of a line makes a math block.

import { InputRule } from '@tiptap/core';

import type { NodeType } from '@tiptap/pm/model';

/** The closing `$` is the one just typed. `(?<![\\$])` skips `\$` and `$$`. A space inside the `$` is not math. */
const INLINE_FIND = /(?<![\\$])\$(?![\s$])([^$\n]*[^$\s\n])\$$/;
const BLOCK_FIND = /^\$\$([^$\n]+)\$\$$/;

export const inlineMathInputRules = (type: NodeType): InputRule[] => [
  new InputRule({
    find: INLINE_FIND,
    handler: ({ state, range, match }) => {
      state.tr.replaceWith(range.from, range.to, type.create({ latex: match[1] }));
    },
  }),
];

export const blockMathInputRules = (type: NodeType): InputRule[] => [
  new InputRule({
    find: BLOCK_FIND,
    handler: ({ state, range, match }) => {
      const $from = state.doc.resolve(range.from);
      // The rule starts at the start of the line: when the math is all the text, it replaces the paragraph.
      const replacesParagraph =
        $from.depth > 0 &&
        $from.parent.isTextblock &&
        range.to === $from.end() &&
        $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), type);
      const from = replacesParagraph ? $from.before() : range.from;
      const to = replacesParagraph ? $from.after() : range.to;
      state.tr.replaceWith(from, to, type.create({ latex: match[1].trim() }));
    },
  }),
];
