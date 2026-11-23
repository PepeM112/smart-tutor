import { common } from 'lowlight';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import type { Options } from 'react-markdown';

// One plugin set for every Markdown surface (question text, chat), so math and code look the same everywhere.
export const RICH_REMARK_PLUGINS: NonNullable<Options['remarkPlugins']> = [remarkGfm, remarkMath];

export const RICH_REHYPE_PLUGINS: NonNullable<Options['rehypePlugins']> = [
  // `errorColor` is an inline style, so a CSS variable is the only way to use a theme token for invalid LaTeX.
  [rehypeKatex, { throwOnError: false, strict: 'ignore', errorColor: 'var(--destructive)' }],
  // Same grammars as the notes editor. No auto-detect: an unlabelled block stays plain.
  [rehypeHighlight, { languages: common, detect: false }],
];
