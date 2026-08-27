'use client';

import { useTranslations } from 'next-intl';

import { MarkdownRenderer } from '@/features/notes/components/markdown-renderer';

type DiffNoteContentProps = {
  oldContent: string;
  newContent: string;
};

export function DiffNoteContent({ oldContent, newContent }: DiffNoteContentProps) {
  const t = useTranslations('notes_ai');

  return (
    <>
      <p className="text-xs font-medium text-muted-foreground mb-1.5 shrink-0">{t('old')}</p>
      <div className="rounded-md border border-feedback-wrong-border bg-feedback-wrong-bg p-3 overflow-y-auto scrollbar-none flex-1 min-h-0">
        <MarkdownRenderer content={oldContent} />
      </div>

      <p className="text-xs font-medium text-muted-foreground mb-1.5 mt-3 shrink-0">{t('new')}</p>
      <div className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg p-3 overflow-y-auto scrollbar-none flex-1 min-h-0">
        <MarkdownRenderer content={newContent} />
      </div>
    </>
  );
}
