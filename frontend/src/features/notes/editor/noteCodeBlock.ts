// Code block extension: lowlight highlight and canonical language names (the React NodeView is
// added in `extensions.ts`, so tests can use this file without React). An alias (`py`) is turned
// into its canonical name (`python`) when the user types the fence, when Markdown is parsed and
// when HTML is pasted, so the stored fence always carries the canonical name.

import { textblockTypeInputRule } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';

import { normalizeCodeLanguage } from './codeLanguages';

// Same shape as the Tiptap rules (a fence, a name, then space or enter), with `+ # -` and digits
// so "c++", "c#" and "py3" are read as names.
const BACKTICK_FENCE = /^```([a-z0-9+#-]+)?[\s\n]$/i;
const TILDE_FENCE = /^~~~([a-z0-9+#-]+)?[\s\n]$/i;

export const NoteCodeBlock = CodeBlockLowlight.extend({
  // A pass-through, on purpose. Tiptap's `extend()` copies the parent's `addProseMirrorPlugins` into the
  // child, and that copy calls `this.parent()` too: each level without its own hook adds the lowlight
  // plugin one more time (3 times with the `.extend()` in `extensions.ts`), so every code block was
  // highlighted 3 times. This hook calls the lowlight hook once, and the copies below it call this one.
  addProseMirrorPlugins() {
    return this.parent?.() ?? [];
  },

  addAttributes() {
    return {
      language: {
        default: null,
        // Pasted HTML: `<pre><code class="language-py">`. Same read as Tiptap, then normalized.
        parseHTML: (element: HTMLElement): string | null => {
          const className = Array.from(element.firstElementChild?.classList ?? []).find(name =>
            name.startsWith('language-')
          );
          return normalizeCodeLanguage(className?.slice('language-'.length));
        },
        rendered: false,
      },
    };
  },

  addInputRules() {
    return [BACKTICK_FENCE, TILDE_FENCE].map(find =>
      textblockTypeInputRule({
        find,
        type: this.type,
        getAttributes: match => ({ language: normalizeCodeLanguage(match[1]) }),
      })
    );
  },

  // Same as the Tiptap rule, but the language goes through `normalizeCodeLanguage`.
  parseMarkdown: (token, helpers) => {
    if (
      token.raw?.startsWith('```') === false &&
      token.raw?.startsWith('~~~') === false &&
      token.codeBlockStyle !== 'indented'
    ) {
      return [];
    }
    return helpers.createNode(
      'codeBlock',
      { language: normalizeCodeLanguage(typeof token.lang === 'string' ? token.lang : undefined) },
      token.text ? [helpers.createTextNode(token.text)] : []
    );
  },
});
