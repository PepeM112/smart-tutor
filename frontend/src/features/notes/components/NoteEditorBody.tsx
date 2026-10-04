'use client';

import { useTranslations } from 'next-intl';
import { type Ref } from 'react';

import { NAME_LIMITS } from '@/lib/limits';
import { cn } from '@/lib/utils';

import { RichNoteEditor, type RichNoteEditorRef } from '../editor/RichNoteEditor';
import { type AutosaveStatus } from '../editor/useAutosave';
import { noteColumnClass } from '../hooks/useNoteColumn';

import { ConflictBanner } from './ConflictBanner';
import { TagInput } from './TagInput';

import type { SelectionContext } from '../editor/NoteBubbleMenu';

type Props = {
  noteId: string;
  title: string;
  onTitleChange: (title: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  status: AutosaveStatus;
  onReload: () => Promise<void>;
  onKeepMine: () => Promise<void>;
  editorRef: Ref<RichNoteEditorRef>;
  initialContent: string;
  onContentChange: (markdown: string) => void;
  onBlur: () => void;
  onAskAi?: (ctx: SelectionContext) => void;
  onSendToAssistant?: (ctx: SelectionContext) => void;
  isFullWidth: boolean;
};

/** Centered text column of an editable note: title, tags, conflict banner and body scroll together. */
export function NoteEditorBody({
  noteId,
  title,
  onTitleChange,
  tags,
  onTagsChange,
  status,
  onReload,
  onKeepMine,
  editorRef,
  initialContent,
  onContentChange,
  onBlur,
  onAskAi,
  onSendToAssistant,
  isFullWidth,
}: Props) {
  const t = useTranslations();

  return (
    <div className={cn(noteColumnClass(isFullWidth), 'pt-20 pb-24')}>
      <input
        type="text"
        // Same limit as the backend (`NoteBase.title`), so a long title cannot cause a 422.
        maxLength={NAME_LIMITS.note}
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder={t('notes.untitled')}
        className="note-title w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none border-none focus:ring-0 p-0"
      />
      <div className="mt-2 mb-6">
        <TagInput tags={tags} onChange={onTagsChange} />
      </div>

      {status === 'conflict' && <ConflictBanner onReload={onReload} onKeepMine={onKeepMine} />}

      <RichNoteEditor
        editorRef={editorRef}
        noteId={noteId}
        initialContent={initialContent}
        onChange={onContentChange}
        onBlur={onBlur}
        onAskAi={onAskAi}
        onSendToAssistant={onSendToAssistant}
      />
    </div>
  );
}
