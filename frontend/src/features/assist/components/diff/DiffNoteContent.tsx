'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { NoteEditorSkeleton } from '@/features/notes/editor/NoteEditorSkeleton';

// The editor (Tiptap and its extensions) is large. It loads when a note is shown, not with the page bundle.
const RichNoteEditor = dynamic(() => import('@/features/notes/editor/RichNoteEditor').then(m => m.RichNoteEditor), {
  ssr: false,
  loading: () => <NoteEditorSkeleton />,
});

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
        {/* key forces a remount when content changes so initialContent is re-parsed */}
        <RichNoteEditor key={oldContent} initialContent={oldContent} editable={false} />
      </div>

      <p className="text-xs font-medium text-muted-foreground mb-1.5 mt-3 shrink-0">{t('new')}</p>
      <div className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg p-3 overflow-y-auto scrollbar-none flex-1 min-h-0">
        <RichNoteEditor key={newContent} initialContent={newContent} editable={false} />
      </div>
    </>
  );
}
