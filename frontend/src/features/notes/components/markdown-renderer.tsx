'use client';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

type Props = {
  content: string;
  className?: string;
};

export function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={cn('markdown-body max-w-none text-sm text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName ?? '');
            const code = (typeof children === 'string' ? children : '').replace(/\n$/, '');

            if (match) {
              return (
                <SyntaxHighlighter language={match[1]} style={oneDark} PreTag="div">
                  {code}
                </SyntaxHighlighter>
              );
            }

            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
