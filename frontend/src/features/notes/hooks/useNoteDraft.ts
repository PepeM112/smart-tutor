'use client';

// The local draft of one note: title, tags and content, autosave, and the sync with the server
// (conflict Reload / Keep mine, and a newer version from a window-focus refetch).
// `NoteForm` keeps only the layout and the AI diff panels.

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type NoteRead } from '@/client';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';

import { type AutosaveStatus, type SavePayload, useAutosave } from '../editor/useAutosave';

import type { RichNoteEditorRef } from '../editor/RichNoteEditor';

type UseNoteDraftArgs = {
  note: NoteRead;
  /** Used to replace the editor content with a server copy, without a remount. */
  editorRef: React.RefObject<RichNoteEditorRef | null>;
};

export type UseNoteDraftReturn = {
  title: string;
  tags: string[];
  /** Mount snapshot for the editor. Later changes go through `editorRef.setMarkdown`. */
  initialContent: string;
  status: AutosaveStatus;
  setTitle: (title: string) => void;
  setTags: (tags: string[]) => void;
  /** Call from the editor `onChange`. */
  setContent: (markdown: string) => void;
  flush: (reindex?: boolean) => Promise<void>;
  /** Conflict: drop the local edits and load the server copy. */
  reload: () => Promise<void>;
  /** Conflict: continue from the server version and send the local copy again. */
  keepMine: () => Promise<void>;
};

export function useNoteDraft({ note, editorRef }: UseNoteDraftArgs): UseNoteDraftReturn {
  const t = useTranslations('notes');
  const queryClient = useQueryClient();

  // Title and tags are state (the inputs show them) and a ref (the stable save payload reads them).
  // The setters below write both, so no state→ref effect is necessary.
  const [title, setTitleState] = useState(note.title);
  const [tags, setTagsState] = useState<string[]>(note.tags ?? []);
  const titleRef = useRef(title);
  const tagsRef = useRef(tags);
  /* The editor owns the live content and reads `initialContent` only on mount. So content is
  not React state (that would re-render the page on every keystroke): a mount snapshot for
  the editor, and a ref for the save payload. */
  const [initialContent] = useState(note.content ?? '');
  const contentRef = useRef(initialContent);

  const buildPayload = useCallback(
    (): SavePayload => ({ title: titleRef.current, content: contentRef.current, tags: tagsRef.current }),
    []
  );

  // Highest version this page knows the server has — our own saves included.
  const knownVersion = useRef(note.version);

  const handleSaved = useCallback(
    (saved: NoteRead) => {
      knownVersion.current = saved.version;
      // Patch the cache instead of refetching, so the editor never remounts.
      queryClient.setQueryData<{ data: NoteRead }>(fileQueryKeys.note(note.id), old =>
        old ? { ...old, data: saved } : old
      );
      void queryClient.invalidateQueries({ queryKey: fileQueryKeys.notes(), refetchType: 'none' });
    },
    [queryClient, note.id]
  );

  const { status, onChange, flush, reset } = useAutosave(note.id, note.version, handleSaved);
  // The focus-refetch effect reads the status, but a status change alone must not run it.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const setTitle = (next: string) => {
    setTitleState(next);
    titleRef.current = next;
    onChange(buildPayload());
  };

  const setTags = (next: string[]) => {
    setTagsState(next);
    tagsRef.current = next;
    onChange(buildPayload());
  };

  const setContent = (markdown: string) => {
    contentRef.current = markdown;
    onChange(buildPayload());
  };

  // Replace the local draft with the server copy. `reset` runs after `setMarkdown`
  // so the change event that `setMarkdown` emits does not schedule a save.
  const applyServerNote = useCallback(
    (fresh: NoteRead) => {
      setTitleState(fresh.title);
      titleRef.current = fresh.title;
      setTagsState(fresh.tags ?? []);
      tagsRef.current = fresh.tags ?? [];
      contentRef.current = fresh.content ?? '';
      editorRef.current?.setMarkdown(fresh.content ?? '');
      reset(fresh.version);
      knownVersion.current = fresh.version;
    },
    [reset, editorRef]
  );

  // A window-focus refetch brought a newer version from another tab/device.
  // Apply it only when there are no local edits; otherwise the next save gets a 409.
  useEffect(() => {
    if (note.version <= knownVersion.current || statusRef.current !== 'saved') return;
    applyServerNote(note);
  }, [note, applyServerNote]);

  // Through the query cache, so `['notes', id]` also holds the server copy afterwards.
  const fetchServerNote = async (): Promise<NoteRead | null> => {
    try {
      const res = await queryClient.fetchQuery({
        queryKey: fileQueryKeys.note(note.id),
        queryFn: () => sdk.notesGet({ path: { note_id: note.id } }),
        staleTime: 0,
      });
      return res.data ?? null;
    } catch {
      toast.error(t('failed_to_load_note'));
      return null;
    }
  };

  const reload = async () => {
    const fresh = await fetchServerNote();
    if (fresh) applyServerNote(fresh);
  };

  const keepMine = async () => {
    const fresh = await fetchServerNote();
    if (!fresh) return;
    reset(fresh.version);
    knownVersion.current = fresh.version;
    onChange(buildPayload());
  };

  return {
    title,
    tags,
    initialContent,
    status,
    setTitle,
    setTags,
    setContent,
    flush,
    reload,
    keepMine,
  };
}
