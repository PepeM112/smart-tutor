'use client';

import dynamic from 'next/dynamic';

import { NoteEditorSkeleton } from './NoteEditorSkeleton';

// The editor (Tiptap and its extensions) is large. It loads when a note is shown, not with the page bundle.
export const LazyRichNoteEditor = dynamic(
  () => import('./RichNoteEditor').then(m => m.RichNoteEditor),
  {
    ssr: false,
    loading: () => <NoteEditorSkeleton />,
  }
);
