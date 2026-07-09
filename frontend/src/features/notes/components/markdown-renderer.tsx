'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

type Props = {
  content: string;
  className?: string;
};

export function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={cn('markdown-body max-w-none text-sm text-foreground', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
