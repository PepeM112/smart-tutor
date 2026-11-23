import 'katex/dist/katex.min.css';
import '@/styles/code-highlight.css';

import ReactMarkdown from 'react-markdown';

import { CHAT_REMARK_PLUGINS, RICH_REHYPE_PLUGINS, RICH_REMARK_PLUGINS } from '@/lib/richTextPlugins';
import { cn } from '@/lib/utils';

import type { Components } from 'react-markdown';

type RichTextProps = {
  text: string;
  /** One-line layout (options, criteria, titles): paragraphs become spans and block elements are unwrapped. */
  inline?: boolean;
  /** `chat` parses math only between `$$`. */
  variant?: 'default' | 'chat';
  className?: string;
};

// `whitespace-pre-line` keeps single line breaks of a plain prompt, as a bare text node did.
const BLOCK_STYLES = cn(
  '[&>*+*]:mt-1.5',
  '[&_p]:whitespace-pre-line',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_h1]:text-base [&_h2]:text-base [&_h3]:text-base [&_h4]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_a]:text-primary [&_a]:underline',
  '[&_strong]:font-semibold',
  '[&_table]:text-sm [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-0.5 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-0.5',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-code-bg [&_pre]:p-2.5 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:leading-relaxed [&_pre]:text-code-fg',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]',
  '[&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:text-[1.25em]',
  '[&_:not(.katex-display)>.katex]:px-[2px]',
  '[&_.katex-error]:text-destructive'
);

// A link in a prompt must not take the user out of an exam in progress.
const LINK_COMPONENTS: Components = {
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

const INLINE_COMPONENTS: Components = {
  ...LINK_COMPONENTS,
  p: ({ children }) => <span className="whitespace-pre-line">{children}</span>,
};

// Block elements are invalid inside the `<p>`, `<span>` and `<button>` that hold inline text.
const INLINE_DISALLOWED_ELEMENTS: string[] = [
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
];

/** Read-only Markdown with code highlight and KaTeX math. Plain text renders as plain text. */
export function RichText({ text, inline = false, variant = 'default', className }: RichTextProps) {
  const Root = inline ? 'span' : 'div';

  return (
    <Root className={cn(BLOCK_STYLES, className)}>
      <ReactMarkdown
        remarkPlugins={variant === 'chat' ? CHAT_REMARK_PLUGINS : RICH_REMARK_PLUGINS}
        rehypePlugins={RICH_REHYPE_PLUGINS}
        components={inline ? INLINE_COMPONENTS : LINK_COMPONENTS}
        disallowedElements={inline ? INLINE_DISALLOWED_ELEMENTS : undefined}
        unwrapDisallowed={inline}
      >
        {text}
      </ReactMarkdown>
    </Root>
  );
}
