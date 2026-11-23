import ReactMarkdown from 'react-markdown';

import { RICH_REHYPE_PLUGINS, RICH_REMARK_PLUGINS } from '@/lib/richTextPlugins';
import { cn } from '@/lib/utils';

import type { Components } from 'react-markdown';

type RichTextProps = {
  text: string;
  /** One-line layout (options, criteria, titles): paragraphs become spans. */
  inline?: boolean;
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
  '[&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
  '[&_.katex-error]:text-destructive'
);

const INLINE_COMPONENTS: Components = {
  p: ({ children }) => <span className="whitespace-pre-line">{children}</span>,
};

/** Read-only Markdown with code highlight and KaTeX math. Plain text renders as plain text. */
export function RichText({ text, inline = false, className }: RichTextProps) {
  const Root = inline ? 'span' : 'div';

  return (
    <Root className={cn(BLOCK_STYLES, className)}>
      <ReactMarkdown
        remarkPlugins={RICH_REMARK_PLUGINS}
        rehypePlugins={RICH_REHYPE_PLUGINS}
        components={inline ? INLINE_COMPONENTS : undefined}
      >
        {text}
      </ReactMarkdown>
    </Root>
  );
}
