'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

import { markdownComponents } from './markdown-components';

type Props = {
  content: string;
  className?: string;
};

export function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={cn('markdown-body max-w-none text-sm text-foreground', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
