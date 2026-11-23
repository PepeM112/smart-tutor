// Math nodes of the note editor: inline `$x^2$` and block `$$ … $$`, drawn with KaTeX.
// The extension ships a Markdown tokenizer, but it does not know `\$` or currency (`$5 and $10`),
// so the tokenizers, the serializers and the input rules are replaced here.

import { Extension, type AnyExtension } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { Markdown } from '@tiptap/markdown';

import { blockMathInputRules, inlineMathInputRules } from './mathInputRules';
import { mathPlugin } from './mathPlugin';

import type { KatexOptions } from 'katex';

/** Notes show `\frac` at display size, also inside a line. `\tfrac` keeps the small form. */
export const NOTE_KATEX_OPTIONS: KatexOptions = { macros: { '\\frac': '\\dfrac' } };

/** `$latex$`. Same rules as Pandoc: no space inside the `$`, and no digit right after the closing `$` (`$5 and $10`). */
const INLINE_MATH = /^\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<!\s)\$(?![$\d])/;

/** `$$ latex $$` (one or many lines) alone on its lines. A blank line ends the search, so two `$$` far apart stay text. */
const BLOCK_MATH = /^\$\$((?:(?!\n[ \t]*\n)[\s\S])+?)\$\$[ \t]*(?:\n|$)/;

/** `$` that is not already escaped becomes `\$`, so the latex never closes the math early. */
const escapeDollars = (latex: string): string =>
  latex.replace(/\\[\s\S]|\$/g, match => (match === '$' ? '\\$' : match));

const inlineSource = (latex: string): string => escapeDollars(latex.replace(/\s*\n\s*/g, ' ').trim());

const blockSource = (latex: string): string => escapeDollars(latex.replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n').trim());

// An empty node (just inserted, not typed yet) is not saved: `$$` alone would break the next parse.
export const NoteInlineMath = InlineMath.extend({
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const match = INLINE_MATH.exec(src);
      return match ? { type: 'inlineMath', raw: match[0], latex: match[1] } : undefined;
    },
  },
  renderMarkdown: node => {
    const source = inlineSource(String(node.attrs?.latex ?? ''));
    return source ? `$${source}$` : '';
  },
  addInputRules() {
    return inlineMathInputRules(this.type);
  },
}).configure({ katexOptions: NOTE_KATEX_OPTIONS });

export const NoteBlockMath = BlockMath.extend({
  markdownTokenizer: {
    name: 'blockMath',
    level: 'block',
    // Only a `$$` at the start of a line can cut a paragraph, so `a $$b$$` stays inside its paragraph.
    start: (src: string) => src.search(/(?<=\n)\$\$/),
    tokenize: (src: string) => {
      const match = BLOCK_MATH.exec(src);
      const latex = match?.[1].trim();
      return match && latex ? { type: 'blockMath', raw: match[0], latex } : undefined;
    },
  },
  renderMarkdown: node => {
    const source = blockSource(String(node.attrs?.latex ?? ''));
    return source ? `$$\n${source}\n$$` : '';
  },
  addInputRules() {
    return blockMathInputRules(this.type);
  },
}).configure({ katexOptions: NOTE_KATEX_OPTIONS });

// Priority above the editing shortcuts: Enter on a selected node must not reach them.
const NoteMathBehavior = Extension.create({
  name: 'noteMathBehavior',
  priority: 1000,
  addProseMirrorPlugins() {
    return [mathPlugin()];
  },
});

/**
 * `Markdown` that also escapes `$` in text (`\$`). Why: the manager escapes `*`, `_`, `[`… but not `$`, so a saved
 * "$5 and $10" would read back as math. Text in code is not escaped (the manager skips it).
 */
let hasWarnedEscapeMissing = false;
const warnEscapeMissing = (): void => {
  if (hasWarnedEscapeMissing) return;
  hasWarnedEscapeMissing = true;
  console.warn('NoteMarkdown: escapeMarkdownSyntax not found, "$" in text is saved unescaped.');
};

export const NoteMarkdown = Markdown.extend({
  onBeforeCreate(props) {
    this.parent?.(props);
    // `escapeMarkdownSyntax` is private in the types and the manager has no option for extra characters.
    const manager = this.storage.manager;
    const escapeBase: unknown = Reflect.get(manager, 'escapeMarkdownSyntax');
    if (typeof escapeBase !== 'function') {
      warnEscapeMissing();
      return;
    }
    Reflect.set(manager, 'escapeMarkdownSyntax', (text: string): string =>
      String(escapeBase.call(manager, text)).replace(/\$/g, '\\$')
    );
  },
});

export const createNoteMathExtensions = (): AnyExtension[] => [NoteInlineMath, NoteBlockMath, NoteMathBehavior];
