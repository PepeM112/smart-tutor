import { common } from 'lowlight';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import type { Options } from 'react-markdown';

// One plugin set for every Markdown surface, so math and code look the same everywhere.
export const RICH_REMARK_PLUGINS: NonNullable<Options['remarkPlugins']> = [remarkGfm, remarkMath];

// Chat replies often hold prices ("$5 to $10"): only `$$` starts math there.
export const CHAT_REMARK_PLUGINS: NonNullable<Options['remarkPlugins']> = [
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }],
];

export const RICH_REHYPE_PLUGINS: NonNullable<Options['rehypePlugins']> = [
  [
    rehypeKatex,
    {
      throwOnError: false,
      strict: 'ignore',
      // `errorColor` is an inline style, so a CSS variable is the only way to use a theme token for invalid LaTeX.
      errorColor: 'var(--destructive)',
      // Inline `\frac` would shrink to text style; `\tfrac` keeps the small form on purpose.
      macros: { '\\frac': '\\dfrac' },
      // Shared course content is untrusted: `\rule{1e5em}{1e5em}` would cover the page.
      maxSize: 20,
    },
  ],
  // Same grammars as the notes editor. No auto-detect: an unlabelled block stays plain.
  [rehypeHighlight, { languages: common, detect: false }],
];
